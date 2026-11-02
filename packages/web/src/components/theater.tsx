import { NIGHTS, jinxKey, type PublicScript } from "@alchemist/domain";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowsOutIcon, MoonIcon, ProjectorScreenIcon, XIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import { requestFullscreen, useFullscreen, useIdle, useWakeLock } from "../hooks/use-theater.ts";
import { characterTitle, groupByTeam, teamPluralLabel } from "../lib/characters.ts";
import { NIGHT_LABELS, STEP_LABELS } from "../lib/night.ts";
import { nightRows, railOf, sheetJinxes } from "../lib/sheets.ts";
import { POSTER_FITS, posterFooter } from "../lib/theater.ts";
import { SheetIcon } from "./sheets.tsx";
import { Button } from "./ui/button.tsx";
import "./theater.css";

const CONTROL = "h-10 bg-black/70 px-4 text-white backdrop-blur hover:bg-black/85 hover:text-white";

const fits = (teams: HTMLElement) =>
  teams.clientHeight > 0 &&
  teams.scrollWidth <= teams.clientWidth + 1 &&
  teams.scrollHeight <= teams.clientHeight + 1;

/**
 * Takes the largest text and icon scale that fits the screen. A Script too long even
 * at the floor scrolls rather than silently losing Characters off the edge.
 */
const fitPoster = (poster: HTMLElement, teams: HTMLElement) => {
  teams.removeAttribute("data-overflowing");

  for (const fit of POSTER_FITS) {
    poster.style.setProperty("--fit", String(fit));

    if (fits(teams)) return;
  }

  teams.setAttribute("data-overflowing", "");
};

/** Refits when the content, the screen or the fonts change what fits. */
function usePosterFit(script: PublicScript, night: boolean) {
  const poster = useRef<HTMLDivElement>(null);
  const teams = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const posterNode = poster.current;
    const teamsNode = teams.current;

    if (posterNode === null || teamsNode === null) return;

    const measure = () => fitPoster(posterNode, teamsNode);
    const observer = new ResizeObserver(measure);

    measure();
    observer.observe(posterNode);
    document.fonts.addEventListener("loadingdone", measure);

    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [script, night]);

  return { poster, teams };
}

function PosterTitle({ script }: { readonly script: PublicScript }) {
  const name = script.name.trim() || "Untitled Script";
  const { logo } = script.artwork;
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  return (
    <header data-slot="poster-title">
      {logo === null || logo === failedLogo ? (
        <p data-slot="poster-name">{name}</p>
      ) : (
        <img src={logo} alt={name} onError={() => setFailedLogo(logo)} />
      )}
      {script.authorCredit.trim() && <p data-slot="poster-author">{script.authorCredit}</p>}
    </header>
  );
}

function PosterTeams({ script }: { readonly script: PublicScript }) {
  const jinxes = sheetJinxes(script);

  return (
    <>
      {groupByTeam(script.characters)
        .filter(({ characters }) => characters.length > 0)
        .map(({ team, characters }) => (
          <section key={team} data-rail={railOf(team)}>
            <h3>{teamPluralLabel(team)}</h3>
            <ul>
              {characters.map((character) => (
                <li key={character.id}>
                  <SheetIcon character={character} />
                  <span>
                    <b>{characterTitle(character)}</b>
                    {character.ability.trim() || (
                      <span data-slot="sheet-blank">No ability written</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {jinxes.length > 0 && (
        <section data-rail="jinx">
          <h3>Jinxes</h3>
          <ul>
            {jinxes.map(({ jinx, first, second }) => (
              <li key={jinxKey(jinx)}>
                <span>
                  <b>
                    {characterTitle(first)} &amp; {characterTitle(second)}
                  </b>
                  {jinx.explanation.trim() || (
                    <span data-slot="sheet-blank">No explanation written</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Who wakes when, in order. The Storyteller's instructions stay on the sheets. */
function NightRibbon({ script }: { readonly script: PublicScript }) {
  return (
    <div data-slot="poster-ribbon">
      {NIGHTS.map((night) => (
        <div key={night}>
          <p>{NIGHT_LABELS[night]}</p>
          <ol aria-label={`${NIGHT_LABELS[night]} order`}>
            {nightRows(night, script.nightOrders[night], script.characters).map((row) =>
              row.kind === "step" ? (
                <li key={row.step} data-step>
                  {STEP_LABELS[row.step]}
                </li>
              ) : (
                <li key={row.character.id}>
                  <SheetIcon character={row.character} />
                  <span>{characterTitle(row.character)}</span>
                </li>
              ),
            )}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** The Script reflowed to the screen's exact shape, for reading from across a room. */
function Poster({ script, night }: { readonly script: PublicScript; readonly night: boolean }) {
  const { poster, teams } = usePosterFit(script, night);

  return (
    <div ref={poster} data-slot="poster">
      <PosterTitle script={script} />
      <div ref={teams} data-slot="poster-teams">
        <PosterTeams script={script} />
      </div>
      {night && <NightRibbon script={script} />}
      <footer data-slot="poster-footer">{posterFooter(window.location.origin, script)}</footer>
    </div>
  );
}

function TheaterContent({
  script,
  night,
  fullscreen,
  onNightChange,
}: {
  readonly script: PublicScript;
  readonly night: boolean;
  readonly fullscreen: boolean;
  readonly onNightChange: (night: boolean) => void;
}) {
  const idle = useIdle(true);

  useWakeLock(true);

  return (
    <div data-slot="theater-stage" data-idle={idle ? "" : undefined}>
      <Dialog.Title className="sr-only">
        Theater Mode: {script.name.trim() || "Untitled Script"}
      </Dialog.Title>
      <Poster script={script} night={night} />
      <div data-slot="theater-controls" className="absolute top-3 right-3 flex gap-2">
        <Button
          variant="ghost"
          aria-pressed={night}
          className={`${CONTROL} aria-pressed:bg-white aria-pressed:text-black aria-pressed:hover:bg-white/90 aria-pressed:hover:text-black`}
          onClick={() => onNightChange(!night)}
        >
          <MoonIcon aria-hidden="true" />
          Night order
        </Button>
        {!fullscreen && document.fullscreenEnabled && (
          <Button variant="ghost" className={CONTROL} onClick={requestFullscreen}>
            <ArrowsOutIcon aria-hidden="true" />
            Fullscreen
          </Button>
        )}
        <Dialog.Close render={<Button variant="ghost" className={CONTROL} />}>
          <XIcon aria-hidden="true" />
          Exit
        </Dialog.Close>
      </div>
    </div>
  );
}

/** Opens Theater Mode. Fullscreen must be requested inside this click. */
export function TheaterEntry({ onEnter }: { readonly onEnter: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-fit"
      onClick={() => {
        requestFullscreen();
        onEnter();
      }}
    >
      <ProjectorScreenIcon aria-hidden="true" />
      Theater Mode
    </Button>
  );
}

/**
 * The Script alone on the screen, for casting to a TV the players can all see. A modal
 * dialog, so it traps focus, locks scrolling, and returns focus to the button on close.
 */
export function TheaterMode({
  script,
  open,
  night,
  onNightChange,
  onExit,
}: {
  readonly script: PublicScript;
  readonly open: boolean;
  readonly night: boolean;
  readonly onNightChange: (night: boolean) => void;
  readonly onExit: () => void;
}) {
  const fullscreen = useFullscreen(open, onExit);
  const popup = useRef<HTMLDivElement>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onExit();
      }}
    >
      <Dialog.Portal>
        {/* Focus the stage: a focus ring on a control would sit on the TV until it fades. */}
        <Dialog.Popup ref={popup} initialFocus={popup} data-slot="theater">
          <TheaterContent
            script={script}
            night={night}
            fullscreen={fullscreen}
            onNightChange={onNightChange}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
