import { NIGHTS, type CharacterId } from "@alchemist/domain";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { NIGHT_LABELS } from "../lib/night.ts";
import {
  PAPERS,
  PAPER_OPTIONS,
  isPaper,
  isSheetView,
  type Paper,
  type SheetContent,
  type SheetView,
} from "../lib/sheets.ts";
import { SheetDownload } from "./sheet-download.tsx";
import { CharacterSheet, NightSheet, type SheetFit } from "./sheets.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";

type Zoom = "fit" | "actual";

const VIEWS: ReadonlyArray<{ readonly value: SheetView; readonly label: string }> = [
  { value: "characters", label: "Characters" },
  ...NIGHTS.map((night) => ({ value: night, label: NIGHT_LABELS[night] })),
];

/**
 * The sheets at their natural page size, scaled to the pane or shown at 100%.
 * Night tabs show the one night sheet, turned so the chosen night reads upright.
 */
export function SheetPreview({
  content,
  view,
  onViewChange,
  selectedId = null,
  onSelect,
}: {
  readonly content: SheetContent;
  readonly view: SheetView;
  readonly onViewChange: (view: SheetView) => void;
  readonly selectedId?: CharacterId | null;
  readonly onSelect?: (id: CharacterId) => void;
}) {
  const [paper, setPaper] = useState<Paper>("letter");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fit, setFit] = useState<SheetFit | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  // The visible tab's scroller; each tab panel renders its own.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const page = PAPERS[paper];
  const sheet = view === "characters" ? "characters" : "night";

  useLayoutEffect(() => {
    if (scroller === null) return;

    const observer = new ResizeObserver(() => setAvailable(scroller.clientWidth));
    observer.observe(scroller);

    return () => observer.disconnect();
  }, [scroller]);

  // Keep the selected Character in view without scrolling the page around the pane.
  useEffect(() => {
    if (scroller === null || selectedId === null) return;

    const row = scroller.querySelector(`[data-character-id="${selectedId}"]`);

    if (row === null) return;

    const outer = scroller.getBoundingClientRect();
    const inner = row.getBoundingClientRect();

    if (inner.top < outer.top || inner.bottom > outer.bottom)
      scroller.scrollTop += inner.top - outer.top - (outer.height - inner.height) / 2;

    if (inner.left < outer.left || inner.right > outer.right)
      scroller.scrollLeft += inner.left - outer.left - (outer.width - inner.width) / 2;
  }, [scroller, selectedId, paper, zoom]);

  const scale = zoom === "actual" || available === null ? 1 : Math.min(1, available / page.width);

  const props = { content, paper, selectedId, onSelect, onFit: setFit };

  const frame: CSSProperties & Record<"--page-w" | "--page-h" | "--zoom", string> = {
    "--page-w": `${page.width}px`,
    "--page-h": `${page.height}px`,
    "--zoom": String(scale),
  };

  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (isSheetView(value)) onViewChange(value);
      }}
      className="min-w-0"
    >
      <TabsList aria-label="Preview sheet" className="w-full">
        {VIEWS.map(({ value, label }) => (
          <TabsTrigger key={value} value={value}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          aria-label="Paper size"
          variant="outline"
          size="sm"
          spacing={0}
          value={[paper]}
          onValueChange={([value]) => {
            if (isPaper(value)) setPaper(value);
          }}
        >
          {PAPER_OPTIONS.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {PAPERS[option].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="Zoom"
          variant="outline"
          size="sm"
          spacing={0}
          value={[zoom]}
          onValueChange={([value]) => {
            if (value === "fit" || value === "actual") setZoom(value);
          }}
        >
          <ToggleGroupItem value="fit">Fit width</ToggleGroupItem>
          <ToggleGroupItem value="actual">100%</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <SheetDownload content={content} paper={paper} />
      <FitNotice fit={fit} />
      {VIEWS.map(({ value }) => (
        <TabsContent key={value} value={value}>
          {/* Only the visible sheet renders, so it measures its real layout. */}
          {value === view && (
            <div
              ref={setScroller}
              data-slot="sheet-scroller"
              className="overflow-auto rounded-lg border border-border bg-muted"
            >
              <div data-slot="sheet-frame" className="mx-auto" style={frame}>
                <div data-slot="sheet-zoom">
                  {/* A new sheet or paper remounts, so it reports its own fit. */}
                  <div key={paper} className={cn(view === "otherNight" && "rotate-180")}>
                    {sheet === "characters" ? (
                      <CharacterSheet {...props} />
                    ) : (
                      <NightSheet {...props} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function FitNotice({ fit }: { readonly fit: SheetFit | null }) {
  if (fit === null || (fit.scale === 1 && !fit.overflowing)) return null;

  return fit.overflowing ? (
    <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
      Too much for one page, even at the smallest legible size. Shorten text or remove entries so
      the whole sheet shows.
    </p>
  ) : (
    <p role="status" className="text-sm text-muted-foreground">
      Text and icons are shrunk to {Math.round(fit.scale * 100)}% to fit one page.
    </p>
  );
}
