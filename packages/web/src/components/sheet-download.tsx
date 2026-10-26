import { CaretDownIcon, DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Match } from "effect";
import { useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  captureSheet,
  loadSheetFonts,
  reloadFailedSheetFonts,
  settleSheetIcons,
} from "../lib/capture.ts";
import { downloadBlob } from "../lib/download.ts";
import {
  CAPTURE_DPI,
  PAPERS,
  SHEET_KINDS,
  SHEET_LABELS,
  sheetFilename,
  type Paper,
  type SheetContent,
  type SheetKind,
} from "../lib/sheets.ts";
import { CharacterSheet, NightSheet, fitSheet } from "./sheets.tsx";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Spinner } from "./ui/spinner.tsx";

interface Job {
  readonly sheets: ReadonlyArray<SheetKind>;
  readonly content: SheetContent;
  readonly paper: Paper;
}

type Outcome =
  | { readonly kind: "saved"; readonly sheet: SheetKind; readonly fallbacks: number }
  | { readonly kind: "overflow"; readonly sheet: SheetKind }
  | { readonly kind: "failed"; readonly sheet: SheetKind }
  | { readonly kind: "fonts" };

const CHOICES: ReadonlyArray<{
  readonly label: string;
  readonly sheets: ReadonlyArray<SheetKind>;
}> = [
  { label: "Character sheet", sheets: ["character"] },
  { label: "Night sheet", sheets: ["night"] },
  { label: "Both sheets", sheets: SHEET_KINDS },
];

/**
 * Downloads the sheets as 300 DPI PNGs at the chosen paper size. Each sheet is
 * captured from its own offscreen copy at natural size, never the scaled preview.
 */
export function SheetDownload({
  content,
  paper,
}: {
  readonly content: SheetContent;
  readonly paper: Paper;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState("");
  const [outcomes, setOutcomes] = useState<ReadonlyArray<Outcome>>([]);
  const [requested, setRequested] = useState<ReadonlyArray<SheetKind>>([]);
  const nodes = useRef<Partial<Record<SheetKind, HTMLElement>>>({});

  const run = async (sheets: ReadonlyArray<SheetKind>) => {
    const next: Job = { sheets, content, paper };
    const results: Array<Outcome> = [];

    // Mount the offscreen copies before measuring them.
    flushSync(() => {
      setOutcomes([]);
      setRequested(sheets);
      setProgress("Loading sheet fonts…");
      setJob(next);
    });

    try {
      const mounted = sheets.flatMap((sheet) => {
        const node = nodes.current[sheet];

        return node === undefined ? [] : [{ sheet, node }];
      });

      reloadFailedSheetFonts();

      if (!(await loadSheetFonts(mounted.map(({ node }) => node.textContent).join("")))) {
        results.push({ kind: "fonts" });

        return;
      }

      for (const [index, { sheet, node }] of mounted.entries()) {
        const step = sheets.length > 1 ? ` (${index + 1} of ${sheets.length})` : "";
        setProgress(`Preparing ${SHEET_LABELS[sheet]}${step}…`);

        const missing = await settleSheetIcons(node);

        // Icons and fonts are final now, so this is the layout the PNG gets.
        if (fitSheet(node).overflowing) {
          results.push({ kind: "overflow", sheet });
          continue;
        }

        try {
          const { blob, fallbacks } = await captureSheet(node, next.paper, (fraction) =>
            setProgress(
              fraction < 1
                ? `Capturing ${SHEET_LABELS[sheet]}${step}… ${Math.round(fraction * 100)}%`
                : `Finishing ${SHEET_LABELS[sheet]}${step}…`,
            ),
          );

          downloadBlob(blob, sheetFilename(next.content.name, sheet));
          results.push({ kind: "saved", sheet, fallbacks: missing + fallbacks });
        } catch {
          results.push({ kind: "failed", sheet });
        }
      }
    } finally {
      setJob(null);
      setOutcomes(results);
    }
  };

  const { label } = PAPERS[paper];

  // Fonts block every requested sheet; otherwise only failed captures repeat.
  const retry = () =>
    void run(
      outcomes.some((outcome) => outcome.kind === "fonts")
        ? requested
        : outcomes.flatMap((outcome) => (outcome.kind === "failed" ? [outcome.sheet] : [])),
    );

  return (
    <div className="flex flex-col items-start gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" disabled={job !== null} />}
        >
          {job === null ? <DownloadSimpleIcon /> : <Spinner aria-hidden="true" role={undefined} />}
          Download PNG
          <CaretDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {label} · {CAPTURE_DPI} DPI
            </DropdownMenuLabel>
            {CHOICES.map((choice) => (
              <DropdownMenuItem key={choice.label} onClick={() => void run(choice.sheets)}>
                {choice.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div role="status" className="text-sm text-muted-foreground empty:hidden">
        {job !== null && progress}
        {job === null &&
          outcomes.flatMap((outcome) =>
            outcome.kind === "saved"
              ? [<Saved key={outcome.sheet} {...outcome} content={content} />]
              : [],
          )}
      </div>
      {outcomes.flatMap((outcome) =>
        outcome.kind === "saved"
          ? []
          : [
              <Blocked
                key={outcome.kind === "fonts" ? "fonts" : outcome.sheet}
                outcome={outcome}
                onRetry={retry}
              />,
            ],
      )}
      {job !== null &&
        createPortal(
          // Natural size, off the page; hidden from assistive tech, which reads the preview.
          <div aria-hidden="true" inert className="pointer-events-none fixed top-0 -left-2500">
            {job.sheets.map((sheet) => {
              const Sheet = sheet === "character" ? CharacterSheet : NightSheet;

              return (
                <div
                  key={sheet}
                  ref={(node) => {
                    const page = node?.querySelector<HTMLElement>('[data-slot="sheet"]');

                    if (page) nodes.current[sheet] = page;
                    else delete nodes.current[sheet];
                  }}
                >
                  <Sheet content={job.content} paper={job.paper} />
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

function Saved({
  sheet,
  fallbacks,
  content,
}: {
  readonly sheet: SheetKind;
  readonly fallbacks: number;
  readonly content: SheetContent;
}) {
  return (
    <p className="flex items-start gap-1.5">
      {fallbacks > 0 && <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-nudge" />}
      <span>
        Downloaded {sheetFilename(content.name, sheet)}.
        {fallbacks > 0 &&
          ` ${fallbacks === 1 ? "1 icon" : `${fallbacks} icons`} didn’t load, so ${fallbacks === 1 ? "it shows" : "they show"} a plain Team token instead.`}
      </span>
    </p>
  );
}

function Blocked({
  outcome,
  onRetry,
}: {
  readonly outcome: Exclude<Outcome, { readonly kind: "saved" }>;
  readonly onRetry: () => void;
}) {
  const message = Match.value(outcome).pipe(
    Match.discriminatorsExhaustive("kind")({
      fonts: () =>
        "Sheet fonts didn’t load, so the PNGs wouldn’t match the preview. Check your connection and try again.",
      overflow: ({ sheet }) =>
        `The ${SHEET_LABELS[sheet]} is too much for one page, even with text and icons shrunk to 80%. Shorten text or remove entries, then download it again.`,
      failed: ({ sheet }) => `Couldn’t create the ${SHEET_LABELS[sheet]} PNG.`,
    }),
  );

  return (
    <div role="alert" className="flex flex-wrap items-start gap-2 text-sm text-destructive">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {outcome.kind !== "overflow" && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
