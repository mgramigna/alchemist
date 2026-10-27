import {
  AUTO_FINISH,
  AUTO_STYLE,
  ICON_SIZE,
  customizations,
  type ArtworkColor,
  type ArtworkCutout,
  type ArtworkStyle,
  type AuthoredTeam,
  type IconVariant,
  type StudioSetting,
} from "@alchemist/domain";
import { ArrowUpIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ICON_VARIANT_LABELS } from "../lib/characters.ts";
import { sameStyle, withSetting } from "../lib/studio.ts";
import {
  CUTOUT_LABELS,
  StylizeFailed,
  cutOut,
  lookColor,
  previewVariants,
  resolveFinish,
  type Cutout,
  type Source,
} from "../lib/stylize.ts";
import { PrototypeSwitcher, usePrototypeVariant } from "./prototype-switcher.tsx";
import { Button } from "./ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { Switch } from "./ui/switch.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";

// PROTOTYPE (#69): four Studio layouts that keep the preview visible while
// adjusting sliders, switchable via `?studio=` on the Script edit route.
const LAYOUTS = [
  ["sticky", "Sticky compact preview"],
  ["split", "Side-by-side split"],
  ["pip", "Floating mini preview"],
  ["tabs", "Fixed preview, tabbed controls"],
] as const;

type Layout = (typeof LAYOUTS)[number][0];

const LAYOUT_KEYS = LAYOUTS.map(([key]) => key);

const CUTOUTS: ReadonlyArray<readonly [ArtworkCutout, string]> = [
  ["auto", "Auto-detect"],
  ["alpha", "Use transparency as-is"],
  ["edge", "Remove backdrop from the edges"],
  ["light", "Remove light paper"],
];

const COLORS: ReadonlyArray<readonly [ArtworkColor, string]> = [
  ["solid", "Solid fill"],
  ["shaded", "Shaded"],
];

type NumericSetting = Exclude<StudioSetting, "cutout" | "color" | "teamShades">;

interface Range {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format?: (value: number) => string;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const pixels = (value: number) => `${value} px`;

// Matches the limits ArtworkStyle enforces.
const RANGES: Record<NumericSetting, Range> = {
  tolerance: { label: "Tolerance", min: 0, max: 0.3, step: 0.01 },
  detail: { label: "Pale interior lines", min: 0, max: 1, step: 0.05, format: percent },
  texture: { label: "Texture", min: 0, max: 1, step: 0.05, format: percent },
  outline: { label: "Pale outline", min: 0, max: 10, step: 0.5, format: pixels },
  shadow: { label: "Shadow", min: 0, max: 1, step: 0.05, format: percent },
  shadowBlur: { label: "Shadow blur", min: 0, max: 30, step: 1, format: pixels },
  shadowY: { label: "Shadow offset", min: -20, max: 30, step: 1, format: pixels },
  size: { label: "Size", min: 0.3, max: 1, step: 0.01, format: percent },
  offsetX: { label: "Horizontal position", min: -120, max: 120, step: 1, format: pixels },
  offsetY: { label: "Vertical position", min: -120, max: 120, step: 1, format: pixels },
};

const clamp = (key: NumericSetting, value: number) =>
  Math.min(RANGES[key].max, Math.max(RANGES[key].min, value));

// Slider steps are decimal; keep saved values free of floating-point noise.
const tidy = (value: number) => Math.round(value * 1000) / 1000;

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly source: Source }
  | { readonly kind: "failed"; readonly message: string };

type Cutting =
  | { readonly kind: "ready"; readonly cut: Cutout }
  | { readonly kind: "failed"; readonly message: string };

type Saving =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * The optional Studio (#13): a drawer of styling controls beside a live,
 * unpublished preview. Saving publishes new variants; until then the
 * Character keeps its current icons.
 */
export function ArtworkStudio({
  open,
  onOpenChange,
  saved,
  team,
  loadSource,
  onSave,
  onReplace,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly saved: ArtworkStyle;
  readonly team: AuthoredTeam;
  readonly loadSource: () => Promise<Source>;
  // Resolves to an error message, or undefined once the new variants are current.
  readonly onSave: (style: ArtworkStyle) => Promise<string | undefined>;
  readonly onReplace: (file: File, style: ArtworkStyle) => void;
}) {
  const layout = usePrototypeVariant("studio", LAYOUT_KEYS);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          "gap-0 overflow-hidden data-[side=right]:w-full",
          layout === "split" ? "data-[side=right]:sm:max-w-4xl" : "data-[side=right]:sm:max-w-xl",
        )}
      >
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>Studio</SheetTitle>
          <SheetDescription>
            Adjust the styling and preview every variant. Your current icons stay in place until you
            save.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <StudioBody
            layout={layout}
            saved={saved}
            team={team}
            loadSource={loadSource}
            onSave={onSave}
            onReplace={onReplace}
            onClose={() => onOpenChange(false)}
          />
        )}
        <PrototypeSwitcher param="studio" variants={LAYOUTS} current={layout} />
      </SheetContent>
    </Sheet>
  );
}

function StudioBody({
  layout,
  saved,
  team,
  loadSource,
  onSave,
  onReplace,
  onClose,
}: {
  readonly layout: Layout;
  readonly saved: ArtworkStyle;
  readonly team: AuthoredTeam;
  readonly loadSource: () => Promise<Source>;
  readonly onSave: (style: ArtworkStyle) => Promise<string | undefined>;
  readonly onReplace: (file: File, style: ArtworkStyle) => void;
  readonly onClose: () => void;
}) {
  const [draft, setDraft] = useState(saved);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [saving, setSaving] = useState<Saving>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoaded({ kind: "loading" });

    void (async () => {
      try {
        const source = await loadSource();

        if (live) setLoaded({ kind: "ready", source });
      } catch (error) {
        if (live)
          setLoaded({
            kind: "failed",
            message:
              error instanceof StylizeFailed
                ? error.message
                : "Couldn’t load the original artwork. Try again.",
          });
      }
    })();

    return () => {
      live = false;
    };
    // Reloads only on retry; the original is fixed while the Studio is open.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Only the cutout settings change the cutout, so other controls skip it.
  const cutting = useMemo((): Cutting | undefined => {
    if (loaded.kind !== "ready") return undefined;

    try {
      return { kind: "ready", cut: cutOut(loaded.source, draft) };
    } catch (error) {
      return {
        kind: "failed",
        message: error instanceof StylizeFailed ? error.message : "Couldn’t cut out this artwork.",
      };
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, draft.cutout, draft.tolerance]);

  const ready = cutting?.kind === "ready" ? cutting.cut : undefined;
  const mode = ready?.mode;

  const set = <K extends StudioSetting>(key: K, value: NonNullable<ArtworkStyle[K]>) =>
    setDraft((current) => withSetting(current, key, value, mode));

  const finish = resolveFinish(draft, mode ?? "alpha");
  const changed = customizations(draft);
  const dirty = !sameStyle(draft, saved);
  const busy = saving.kind === "saving";

  const save = async () => {
    setSaving({ kind: "saving" });
    const message = await onSave(draft);

    if (message === undefined) onClose();
    else setSaving({ kind: "failed", message });
  };

  const previews = usePreviews(ready, team, draft);

  const status = (
    <>
      {loaded.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Spinner aria-hidden="true" role={undefined} />
          Loading the original artwork…
        </p>
      )}
      {loaded.kind === "failed" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
          {loaded.message}
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}
      {cutting?.kind === "failed" && (
        <p role="alert" className="text-destructive">
          {cutting.message}
        </p>
      )}
    </>
  );

  const preview = (fit: PreviewFit) =>
    ready !== undefined && (
      <StudioPreview
        fit={fit}
        previews={previews}
        onMove={(x, y) => {
          set("offsetX", tidy(clamp("offsetX", x)));
          set("offsetY", tidy(clamp("offsetY", y)));
        }}
        onResize={(size) => set("size", tidy(clamp("size", size)))}
        offset={{ x: finish.offsetX, y: finish.offsetY }}
        size={finish.size}
      />
    );

  const groups = {
    cutout: (
      <Group title="Cutout">
        {ready !== undefined && <CutoutPreview cut={ready} />}
        <Choices
          label="Cutout"
          options={CUTOUTS}
          value={draft.cutout ?? AUTO_FINISH.cutout}
          onChange={(value) => set("cutout", value)}
        />
        <RangeControl
          setting="tolerance"
          value={draft.tolerance ?? AUTO_FINISH.tolerance}
          onChange={(value) => set("tolerance", value)}
          hint="Higher removes more of the backdrop or paper."
        />
      </Group>
    ),
    color: (
      <Group title="Color">
        <Choices
          label="Color"
          options={COLORS}
          value={finish.color}
          disabled={mode === undefined}
          onChange={(value) => set("color", value)}
        />
        <RangeControl
          setting="detail"
          value={finish.detail}
          disabled={mode === undefined}
          onChange={(value) => set("detail", value)}
        />
        <TeamShades
          checked={finish.teamShades}
          team={team}
          onChange={(checked) => set("teamShades", checked)}
        />
      </Group>
    ),
    finish: (
      <Group title="Finish">
        {(["texture", "outline", "shadow", "shadowBlur", "shadowY"] as const).map((setting) => (
          <RangeControl
            key={setting}
            setting={setting}
            value={finish[setting]}
            onChange={(value) => set(setting, value)}
          />
        ))}
      </Group>
    ),
    position: (
      <Group title="Size and position">
        {(["size", "offsetX", "offsetY"] as const).map((setting) => (
          <RangeControl
            key={setting}
            setting={setting}
            value={finish[setting]}
            onChange={(value) => set(setting, value)}
          />
        ))}
      </Group>
    ),
  };

  const replacement = <TransparentReplacement onChoose={(file) => onReplace(file, draft)} />;
  const parts = { status, preview, groups, replacement, previews };

  return (
    <>
      {layout === "sticky" && <StickyLayout {...parts} />}
      {layout === "split" && <SplitLayout {...parts} />}
      {layout === "pip" && <PipLayout {...parts} />}
      {layout === "tabs" && <TabsLayout {...parts} />}
      <SheetFooter className="shrink-0 gap-3 border-t">
        <p className="text-sm text-muted-foreground">
          {changed.length === 0 ? (
            "Automatic styling."
          ) : (
            <>
              Customized: {changed.join(", ")} ·{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={busy}
                onClick={() => setDraft({ ...AUTO_STYLE })}
              >
                Reset to auto
              </Button>
            </>
          )}
        </p>
        {saving.kind === "saving" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden="true" role={undefined} />
            Publishing icons…
          </p>
        )}
        {saving.kind === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            {saving.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !dirty || ready === undefined} onClick={() => void save()}>
            {saving.kind === "failed" ? "Try again" : "Save"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

type Previews = ReadonlyArray<{ readonly variant: IconVariant; readonly url: string }>;

// Rendering every variant takes a moment; coalesce rapid slider changes into one frame.
function usePreviews(cut: Cutout | undefined, team: AuthoredTeam, settings: ArtworkStyle) {
  const [previews, setPreviews] = useState<Previews>([]);

  useEffect(() => {
    if (cut === undefined) return;

    const frame = requestAnimationFrame(() => setPreviews(previewVariants(cut, team, settings)));

    return () => cancelAnimationFrame(frame);
  }, [cut, team, settings]);

  return previews;
}

type PreviewFit = "full" | "compact" | "column";

const STAGE_SIZES: Record<PreviewFit, string> = {
  full: "size-40 sm:size-48",
  compact: "size-28 sm:size-32",
  column: "size-28 sm:size-32 md:size-72",
};

type GroupKey = "cutout" | "color" | "finish" | "position";

interface LayoutParts {
  readonly status: ReactNode;
  readonly preview: (fit: PreviewFit) => ReactNode;
  readonly groups: Record<GroupKey, ReactNode>;
  readonly replacement: ReactNode;
  readonly previews: Previews;
}

const GROUP_ORDER: ReadonlyArray<readonly [GroupKey, string]> = [
  ["cutout", "Cutout"],
  ["color", "Color"],
  ["finish", "Finish"],
  ["position", "Position"],
];

const allGroups = (groups: LayoutParts["groups"]) =>
  GROUP_ORDER.map(([key]) => <div key={key}>{groups[key]}</div>);

/** PROTOTYPE A: one scroll column; a compact preview pins to the top. */
function StickyLayout({ status, preview, groups, replacement }: LayoutParts) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-popover/95 p-4 backdrop-blur">
        {status}
        {preview("compact")}
      </div>
      <div className="flex flex-col gap-6 p-4">
        {allGroups(groups)}
        {replacement}
      </div>
    </div>
  );
}

/** PROTOTYPE B: a wider drawer; preview column beside an independently scrolling control column. */
function SplitLayout({ status, preview, groups, replacement }: LayoutParts) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex shrink-0 flex-col gap-3 border-b p-4 md:w-88 md:overflow-y-auto md:border-r md:border-b-0">
        {status}
        {preview("column")}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {allGroups(groups)}
        {replacement}
      </div>
    </div>
  );
}

/** PROTOTYPE C: today's layout, plus a picture-in-picture preview once the real one scrolls away. */
function PipLayout({ status, preview, groups, replacement, previews }: LayoutParts) {
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const root = scroller.current;
    const target = anchor.current;

    if (root === null || target === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => setAway(entry !== undefined && !entry.isIntersecting),
      { root, threshold: 0.4 },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  const [first, ...rest] = previews;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {status}
        <div ref={anchor}>{preview("full")}</div>
        {allGroups(groups)}
        {replacement}
      </div>
      {away && first !== undefined && (
        <button
          type="button"
          onClick={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })}
          className="absolute right-4 bottom-4 z-10 flex flex-col items-center gap-1.5 rounded-xl border bg-popover p-2 text-xs text-muted-foreground shadow-lg transition hover:shadow-xl"
        >
          <img
            src={first.url}
            alt=""
            width={ICON_SIZE}
            height={ICON_SIZE}
            className="checkerboard size-28 rounded-md border"
          />
          <span className="flex gap-1">
            {rest.map(({ variant, url }) => (
              <img key={variant} src={url} alt="" className="size-8" />
            ))}
          </span>
          <span className="flex items-center gap-1">
            <ArrowUpIcon /> Back to preview
          </span>
        </button>
      )}
    </div>
  );
}

/** PROTOTYPE D: preview never scrolls; one control group at a time in tabs below it. */
function TabsLayout({ status, preview, groups, replacement }: LayoutParts) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b p-4">
        {status}
        {preview("full")}
      </div>
      <Tabs defaultValue="cutout" className="min-h-0 flex-1 gap-0">
        <TabsList className="mx-4 mt-3 w-auto shrink-0">
          {GROUP_ORDER.map(([key, label]) => (
            <TabsTrigger key={key} value={key}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {GROUP_ORDER.map(([key]) => (
          <TabsContent
            key={key}
            value={key}
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4"
          >
            {groups[key]}
            {key === "cutout" && replacement}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<readonly [T, string]>;
  readonly value: T;
  readonly disabled?: boolean;
  readonly onChange: (value: T) => void;
}) {
  const name = useId();

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map(([option, text]) => (
        <label
          key={option}
          className="flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm has-checked:border-ring has-checked:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-60"
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          {text}
        </label>
      ))}
    </div>
  );
}

function RangeControl({
  setting,
  value,
  disabled = false,
  hint,
  onChange,
}: {
  readonly setting: NumericSetting;
  readonly value: number;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly onChange: (value: number) => void;
}) {
  const id = useId();
  const { label, min, max, step, format = String } = RANGES[setting];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="text-muted-foreground tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        onChange={(event) => onChange(tidy(Number(event.currentTarget.value)))}
        className="w-full accent-primary disabled:opacity-50"
      />
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function TeamShades({
  checked,
  team,
  onChange,
}: {
  readonly checked: boolean;
  readonly team: AuthoredTeam;
  readonly onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const applies = team === "outsider" || team === "minion";

  return (
    <div className="flex items-start gap-3 text-sm">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-1">
        <label id={`${id}-label`} htmlFor={id}>
          Team shades
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Outsider cyan and Minion orange for those Teams’ regular icons.
          {applies ? "" : " Kept for when this Character changes Team."}
        </p>
      </div>
    </div>
  );
}

const KEY_STEP = 2;
const SIZE_STEP = 0.02;

/**
 * Every variant at full preview size. The first can be dragged to move the
 * art, scrolled to resize it, or focused and moved with the keyboard.
 */
function StudioPreview({
  fit,
  previews,
  offset,
  size,
  onMove,
  onResize,
}: {
  readonly fit: PreviewFit;
  readonly previews: Previews;
  readonly offset: { readonly x: number; readonly y: number };
  readonly size: number;
  readonly onMove: (x: number, y: number) => void;
  readonly onResize: (size: number) => void;
}) {
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; k: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const helpId = useId();

  // Scrolling resizes rather than scrolls the drawer, which React's passive wheel events can't stop.
  const resize = useRef(onResize);
  resize.current = onResize;
  const currentSize = useRef(size);
  currentSize.current = size;

  useEffect(() => {
    const element = stage.current;

    if (element === null) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      resize.current(currentSize.current - Math.sign(event.deltaY) * SIZE_STEP);
    };

    element.addEventListener("wheel", onWheel, { passive: false });

    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
      k: ICON_SIZE / event.currentTarget.clientWidth,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;

    if (start === null) return;
    onMove(
      Math.round(start.ox + (event.clientX - start.x) * start.k),
      Math.round(start.oy + (event.clientY - start.y) * start.k),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP;

    switch (event.key) {
      case "ArrowLeft":
        onMove(offset.x - step, offset.y);
        break;
      case "ArrowRight":
        onMove(offset.x + step, offset.y);
        break;
      case "ArrowUp":
        onMove(offset.x, offset.y - step);
        break;
      case "ArrowDown":
        onMove(offset.x, offset.y + step);
        break;
      case "+":
      case "=":
        onResize(size + SIZE_STEP);
        break;
      case "-":
      case "_":
        onResize(size - SIZE_STEP);
        break;
      default:
        return;
    }

    event.preventDefault();
  };

  const first = previews[0];
  const label = first === undefined ? "Icon" : ICON_VARIANT_LABELS[first.variant];

  return (
    <section aria-label="Live preview" className="flex flex-col gap-3">
      <div
        className={cn(
          "flex items-end gap-4",
          fit === "compact" ? "flex-nowrap" : "flex-wrap",
          fit === "column" && "md:flex-col md:items-start",
        )}
      >
        <div
          ref={stage}
          role="img"
          tabIndex={0}
          aria-label={`${label} preview: position ${offset.x}, ${offset.y}; size ${percent(size)}`}
          aria-describedby={helpId}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
          className={cn(
            "checkerboard shrink-0 cursor-move touch-none overflow-hidden rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            STAGE_SIZES[fit],
          )}
        >
          {first !== undefined && (
            <img
              src={first.url}
              alt=""
              draggable={false}
              width={ICON_SIZE}
              height={ICON_SIZE}
              className="pointer-events-none size-full select-none"
            />
          )}
        </div>
        <ul
          aria-label="Preview variants"
          className={cn("flex flex-wrap", fit === "compact" ? "gap-2" : "gap-4")}
        >
          {previews.map(({ variant, url }) => (
            <li key={variant} className="flex flex-col items-center gap-1 text-xs">
              <img
                src={url}
                alt=""
                width={ICON_SIZE}
                height={ICON_SIZE}
                className={fit === "compact" ? "size-12" : "size-16"}
              />
              {ICON_VARIANT_LABELS[variant]}
            </li>
          ))}
        </ul>
      </div>
      <p
        id={helpId}
        className={cn("text-xs text-muted-foreground", fit === "compact" && "sr-only")}
      >
        Drag the large preview to move the art and scroll on it to resize. With the keyboard, focus
        it and use the arrow keys to move (Shift for bigger steps) and + or − to resize.
      </p>
    </section>
  );
}

function CutoutPreview({ cut }: { readonly cut: Cutout }) {
  const url = useMemo(() => cut.canvas.toDataURL("image/png"), [cut]);

  return (
    <figure className="flex items-center gap-3 text-sm text-muted-foreground">
      <img
        src={url}
        alt="Artwork after cutout"
        className="checkerboard size-24 rounded-lg border object-contain"
      />
      <figcaption>
        {cut.detected ? "Auto-detect " : "This cutout "}
        {CUTOUT_LABELS[cut.mode]}.
      </figcaption>
    </figure>
  );
}

function TransparentReplacement({ onChoose }: { readonly onChoose: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <section
      aria-label="Transparent replacement"
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-sm"
    >
      <p className="text-muted-foreground">
        If no cutout gives a clean result, remove the background in an image editor and upload a
        version with a transparent background. Your other Studio settings are kept.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";

          if (file !== undefined) onChoose(file);
        }}
      />
      <div>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          <UploadSimpleIcon />
          Upload transparent artwork
        </Button>
      </div>
    </section>
  );
}
