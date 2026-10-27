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
import { UploadSimpleIcon } from "@phosphor-icons/react";
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>Studio</SheetTitle>
          <SheetDescription>
            Adjust the styling and preview every variant. Your current icons stay in place until you
            save.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <StudioBody
            saved={saved}
            team={team}
            loadSource={loadSource}
            onSave={onSave}
            onReplace={onReplace}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StudioBody({
  saved,
  team,
  loadSource,
  onSave,
  onReplace,
  onClose,
}: {
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

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
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
        {ready !== undefined && (
          <StudioPreview
            cut={ready}
            team={team}
            settings={draft}
            onMove={(x, y) => {
              set("offsetX", tidy(clamp("offsetX", x)));
              set("offsetY", tidy(clamp("offsetY", y)));
            }}
            onResize={(size) => set("size", tidy(clamp("size", size)))}
            offset={{ x: finish.offsetX, y: finish.offsetY }}
            size={finish.size}
          />
        )}
        {cutting?.kind === "failed" && (
          <p role="alert" className="text-destructive">
            {cutting.message}
          </p>
        )}
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
        <TransparentReplacement onChoose={(file) => onReplace(file, draft)} />
      </div>
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
  cut,
  team,
  settings,
  offset,
  size,
  onMove,
  onResize,
}: {
  readonly cut: Cutout;
  readonly team: AuthoredTeam;
  readonly settings: ArtworkStyle;
  readonly offset: { readonly x: number; readonly y: number };
  readonly size: number;
  readonly onMove: (x: number, y: number) => void;
  readonly onResize: (size: number) => void;
}) {
  const [previews, setPreviews] = useState<
    ReadonlyArray<{ readonly variant: IconVariant; readonly url: string }>
  >([]);

  const drag = useRef<{ x: number; y: number; ox: number; oy: number; k: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const helpId = useId();

  // Rendering every variant takes a moment; coalesce rapid slider changes into one frame.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPreviews(previewVariants(cut, team, settings)));

    return () => cancelAnimationFrame(frame);
  }, [cut, team, settings]);

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
      <div className="flex flex-wrap items-end gap-4">
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
          className="checkerboard size-40 shrink-0 cursor-move touch-none overflow-hidden rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-48"
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
        <ul aria-label="Preview variants" className="flex flex-wrap gap-4">
          {previews.map(({ variant, url }) => (
            <li key={variant} className="flex flex-col items-center gap-1 text-xs">
              <img src={url} alt="" width={ICON_SIZE} height={ICON_SIZE} className="size-16" />
              {ICON_VARIANT_LABELS[variant]}
            </li>
          ))}
        </ul>
      </div>
      <p id={helpId} className="text-xs text-muted-foreground">
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
