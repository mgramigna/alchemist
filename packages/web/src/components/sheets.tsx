import {
  genericIcons,
  jinxKey,
  type CharacterId,
  type NightStep,
  type PublicCharacter,
} from "@alchemist/domain";
import {
  MoonIcon,
  SkullIcon,
  SunHorizonIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { showFallbackIcon } from "../lib/capture.ts";
import { characterTitle, teamPluralLabel } from "../lib/characters.ts";
import { NIGHT_LABELS, STEP_DESCRIPTIONS, STEP_LABELS } from "../lib/night.ts";
import {
  DISCLAIMER,
  FIT_STEPS,
  PAPERS,
  characterSheetColumns,
  fallbackIcon,
  nightRows,
  railOf,
  type Paper,
  type SheetContent,
  type TeamGroup,
} from "../lib/sheets.ts";
import "./sheets.css";

/** How a sheet fits its page: the scale used, and whether it still overflows at the floor. */
export interface SheetFit {
  readonly scale: number;
  readonly overflowing: boolean;
}

interface SheetProps {
  readonly content: SheetContent;
  readonly paper: Paper;
  // Interactive in the Workbench preview: rows become buttons and the selection is marked.
  readonly selectedId?: CharacterId | null | undefined;
  readonly onSelect?: ((id: CharacterId) => void) | undefined;
  readonly onFit?: ((fit: SheetFit) => void) | undefined;
}

const overflowing = (sheet: HTMLElement) =>
  [...sheet.querySelectorAll<HTMLElement>("[data-fit]")].some(
    (region) => region.scrollHeight > region.clientHeight + 1,
  );

/**
 * Steps text and icons down until the sheet fits one page, stopping at the
 * legibility floor. Never scales up: a short Script stays top-aligned at 100%.
 */
export const fitSheet = (node: HTMLElement): SheetFit => {
  let scale = 1;

  for (const step of FIT_STEPS) {
    scale = step;
    node.style.setProperty("--fit", String(step));

    if (!overflowing(node)) break;
  }

  return { scale, overflowing: overflowing(node) };
};

/** Fits the sheet after each render and when fonts load, reporting changes. */
function useFit(sheet: RefObject<HTMLElement | null>, onFit: SheetProps["onFit"]) {
  const reported = useRef<SheetFit | null>(null);
  const report = useRef(onFit);
  report.current = onFit;

  useLayoutEffect(() => {
    const node = sheet.current;

    if (node === null) return;

    const measure = () => {
      const fit = fitSheet(node);
      const last = reported.current;

      if (last?.scale === fit.scale && last.overflowing === fit.overflowing) return;

      reported.current = fit;
      report.current?.(fit);
    };

    measure();
    document.fonts.addEventListener("loadingdone", measure);

    return () => document.fonts.removeEventListener("loadingdone", measure);
  });
}

function Page({
  paper,
  label,
  onFit,
  children,
}: {
  readonly paper: Paper;
  readonly label: string;
  readonly onFit: SheetProps["onFit"];
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const { width, height } = PAPERS[paper];

  const size: CSSProperties & { "--page-w": string; "--page-h": string } = {
    "--page-w": `${width}px`,
    "--page-h": `${height}px`,
  };

  useFit(ref, onFit);

  return (
    <section ref={ref} aria-label={label} data-slot="sheet" style={size}>
      {children}
    </section>
  );
}

/**
 * The regular (or unaligned) icon every sheet uses. One that fails to load
 * shows a plain Team token instead, here and in the captured PNG.
 */
const SheetIcon = ({ character }: { readonly character: PublicCharacter }) => (
  <img
    src={genericIcons(character.team)[0]?.path}
    alt=""
    width={400}
    height={400}
    data-fallback={fallbackIcon(character.team)}
    onError={(event) => showFallbackIcon(event.currentTarget)}
  />
);

function Row({
  character,
  selectedId,
  onSelect,
  children,
}: {
  readonly character: PublicCharacter;
  readonly selectedId: CharacterId | null | undefined;
  readonly onSelect: ((id: CharacterId) => void) | undefined;
  readonly children: ReactNode;
}) {
  if (onSelect === undefined) return <div data-slot="sheet-row">{children}</div>;

  return (
    <button
      type="button"
      data-slot="sheet-row"
      data-character-id={character.id}
      aria-pressed={character.id === selectedId}
      onClick={() => onSelect(character.id)}
    >
      {children}
    </button>
  );
}

/** Variant B front: title band, Good left, Evil then Travellers then Jinxes right. */
export function CharacterSheet({ content, paper, selectedId, onSelect, onFit }: SheetProps) {
  const { left, right } = characterSheetColumns(content.characters);

  const team = ({ team: id, characters }: TeamGroup) => (
    <TeamSection key={id} team={id}>
      {characters.map((character) => (
        <li key={character.id}>
          <Row character={character} selectedId={selectedId} onSelect={onSelect}>
            <SheetIcon character={character} />
            <span>
              <span data-slot="sheet-name">{characterTitle(character)}</span>
              <span data-slot="sheet-ability">
                {character.ability.trim() || (
                  <span data-slot="sheet-blank">No ability written</span>
                )}
              </span>
            </span>
          </Row>
        </li>
      ))}
    </TeamSection>
  );

  return (
    <Page paper={paper} label="Character sheet" onFit={onFit}>
      <header data-slot="sheet-title">
        <p data-slot="sheet-title-name">{content.name.trim() || "Untitled Script"}</p>
        {content.authorCredit.trim() && (
          <p data-slot="sheet-title-author">{content.authorCredit}</p>
        )}
      </header>
      <div data-slot="sheet-columns">
        <div data-slot="sheet-column" data-fit>
          {left.map(team)}
        </div>
        <div data-slot="sheet-column" data-fit>
          {right.map(team)}
          <Jinxes content={content} />
        </div>
      </div>
      <footer data-slot="sheet-footer">{DISCLAIMER}</footer>
    </Page>
  );
}

function TeamSection({
  team,
  children,
}: {
  readonly team: TeamGroup["team"];
  readonly children: ReactNode;
}) {
  const id = useId();

  return (
    <section aria-labelledby={id} data-slot="sheet-team" data-rail={railOf(team)}>
      <div data-slot="sheet-rail">
        <h3 id={id}>{teamPluralLabel(team)}</h3>
      </div>
      <ul>{children}</ul>
    </section>
  );
}

function Jinxes({ content }: { readonly content: SheetContent }) {
  const id = useId();
  const byId = new Map(content.characters.map((character) => [character.id, character]));

  const jinxes = content.jinxes.flatMap((jinx) => {
    const first = byId.get(jinx.first);
    const second = byId.get(jinx.second);

    return first && second ? [{ jinx, first, second }] : [];
  });

  if (jinxes.length === 0) return null;

  return (
    <section aria-labelledby={id} data-slot="sheet-jinxes">
      <h3 id={id}>Jinxes</h3>
      <ul>
        {jinxes.map(({ jinx, first, second }) => (
          <li key={jinxKey(jinx)} data-slot="sheet-jinx">
            <span data-slot="sheet-jinx-icons">
              <SheetIcon character={first} />
              <SheetIcon character={second} />
            </span>
            <span>
              <b>
                {characterTitle(first)} &amp; {characterTitle(second)}:
              </b>{" "}
              {jinx.explanation.trim() || (
                <span data-slot="sheet-blank">No explanation written</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEP_GLYPHS: Record<NightStep, Icon> = {
  dusk: MoonIcon,
  minioninfo: UsersThreeIcon,
  demoninfo: SkullIcon,
  dawn: SunHorizonIcon,
};

/** Variant B back: First Night upright, Other Nights turned to face across the table. */
export function NightSheet({ content, paper, selectedId, onSelect, onFit }: SheetProps) {
  return (
    <Page paper={paper} label="Night sheet" onFit={onFit}>
      <div data-slot="sheet-night">
        <NightHalf
          content={content}
          night="firstNight"
          selectedId={selectedId}
          onSelect={onSelect}
        />
        <div data-slot="sheet-spine" aria-hidden="true">
          <p>{content.name.trim() || "Untitled Script"}</p>
        </div>
        <NightHalf
          content={content}
          night="otherNight"
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
      <footer data-slot="sheet-footer">{DISCLAIMER}</footer>
    </Page>
  );
}

function NightHalf({
  content,
  night,
  selectedId,
  onSelect,
}: Pick<SheetProps, "content" | "selectedId" | "onSelect"> & {
  readonly night: "firstNight" | "otherNight";
}) {
  const label = NIGHT_LABELS[night];

  return (
    <div data-slot="sheet-half" data-flipped={night === "otherNight" ? "" : undefined}>
      <p data-slot="sheet-half-title">{label}</p>
      <ol aria-label={`${label} sheet`} data-fit>
        {nightRows(night, content.nightOrders[night], content.characters).map((row) => {
          if (row.kind === "step") {
            const Glyph = STEP_GLYPHS[row.step];

            return (
              <li key={row.step} data-slot="sheet-step" data-step={row.step}>
                <span data-slot="sheet-glyph">
                  <Glyph weight="fill" aria-hidden="true" />
                </span>
                <span data-slot="sheet-step-name">{STEP_LABELS[row.step]}</span>
                <span data-slot="sheet-step-text">{STEP_DESCRIPTIONS[row.step]}</span>
              </li>
            );
          }

          const { character, instructions } = row;

          return (
            <li key={character.id}>
              <Row character={character} selectedId={selectedId} onSelect={onSelect}>
                <SheetIcon character={character} />
                <span>
                  <span data-slot="sheet-name">{characterTitle(character)}</span>{" "}
                  {instructions || <span data-slot="sheet-blank">No instructions written</span>}
                </span>
              </Row>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
