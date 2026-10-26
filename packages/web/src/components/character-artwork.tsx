import {
  SOURCE_TYPES,
  characterIcons,
  isStale,
  sourceProblem,
  type ArtworkLook,
  type AuthoredTeam,
  type Character,
  type CharacterArtwork,
  type ScriptId,
} from "@alchemist/domain";
import { useAtomSet } from "@effect/atom-react";
import { ImageIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Cause, Exit, Predicate, Result } from "effect";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { cn } from "cn";
import { readArtworkSource, removeArtwork, restyleArtwork, uploadArtwork } from "../api.ts";
import { ICON_VARIANT_LABELS, teamLabel } from "../lib/characters.ts";
import {
  CUTOUT_LABELS,
  StylizeFailed,
  cutoutFrom,
  lookThumbnail,
  renderVariants,
  resolveLook,
  type Cutout,
} from "../lib/stylize.ts";
import { CharacterToken } from "./character-token.tsx";
import { Button } from "./ui/button.tsx";
import { Spinner } from "./ui/spinner.tsx";

const LOOK_LABELS: Record<Exclude<ArtworkLook, "auto">, string> = {
  solid: "Solid",
  shaded: "Shaded",
  lines: "Pale lines",
};

const LOOKS: ReadonlyArray<ArtworkLook> = ["auto", "solid", "shaded", "lines"];

// Recently styled originals, so reselecting a Character or changing Look skips a download.
const cutouts = new Map<string, Promise<Cutout>>();

const remember = (sourceId: string, cut: Promise<Cutout>) => {
  cutouts.delete(sourceId);
  cutouts.set(sourceId, cut);

  for (const key of cutouts.keys()) {
    if (cutouts.size <= 8) break;
    cutouts.delete(key);
  }

  // A failed decode or download is retried next time rather than remembered.
  cut.catch(() => cutouts.delete(sourceId));

  return cut;
};

type Job =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly label: string }
  | { readonly kind: "failed"; readonly message: string; readonly retry: () => void };

const IDLE: Job = { kind: "idle" };

const failureMessage = (exit: Exit.Exit<unknown, unknown>, fallback: string) => {
  if (Exit.isSuccess(exit)) return fallback;
  const error = Cause.findError(exit.cause);

  if (Result.isFailure(error)) return fallback;

  if (
    Predicate.isTagged(error.success, "ArtworkInvalid") &&
    Predicate.hasProperty(error.success, "message")
  )
    return String(error.success.message);

  if (Predicate.isTagged(error.success, "ArtworkConflict"))
    return "This artwork changed in another tab. Reload to see the latest version.";

  return fallback;
};

/**
 * Upload, automatic styling and the Look picker for one Character. The
 * current icons stay in place until a replacement is fully published.
 */
export function CharacterArtworkEditor({
  scriptId,
  character,
  onArtwork,
}: {
  readonly scriptId: ScriptId;
  readonly character: Character;
  readonly onArtwork: (artwork: CharacterArtwork | undefined) => void;
}) {
  const upload = useAtomSet(uploadArtwork, { mode: "promiseExit" });
  const restyle = useAtomSet(restyleArtwork, { mode: "promiseExit" });
  const readSource = useAtomSet(readArtworkSource, { mode: "promiseExit" });
  const remove = useAtomSet(removeArtwork, { mode: "promiseExit" });
  const [job, setJob] = useState<Job>(IDLE);
  const [cut, setCut] = useState<Cutout | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const { artwork, team } = character;
  const busy = job.kind === "working";

  const fail = (message: string, retry: () => void) => setJob({ kind: "failed", message, retry });

  const cutoutOf = (current: CharacterArtwork) =>
    cutouts.get(current.sourceId) ??
    remember(
      current.sourceId,
      readSource({ payload: { scriptId, id: character.id } }).then((exit) => {
        if (Exit.isFailure(exit))
          throw new StylizeFailed("Couldn’t load the original artwork. Try again.");

        return cutoutFrom(
          new Blob([new Uint8Array(exit.value.bytes)], { type: exit.value.contentType }),
        );
      }),
    );

  // Show the cutout behind the current artwork, for the automatic note and Look thumbnails.
  useEffect(() => {
    if (artwork === undefined) return setCut(null);
    let live = true;

    cutoutOf(artwork).then(
      (loaded) => live && setCut(loaded),
      () => live && setCut(null),
    );

    return () => {
      live = false;
    };
    // The cutout depends only on which original is current.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [artwork?.sourceId]);

  const publishFile = async (file: File) => {
    setJob({ kind: "working", label: "Styling your artwork…" });
    const source = new Uint8Array(await file.arrayBuffer());
    const problem = sourceProblem(source);

    if (problem !== undefined) return fail(problem, () => input.current?.click());

    try {
      const cutout = await cutoutFrom(new Blob([source], { type: file.type }));
      const variants = await renderVariants(cutout, team, "auto");
      setJob({ kind: "working", label: "Publishing icons…" });

      const exit = await upload({
        payload: { scriptId, id: character.id, source, style: { look: "auto" }, team, variants },
      });

      if (Exit.isFailure(exit))
        return fail(
          failureMessage(exit, "Couldn’t save the artwork. Your previous icons are unchanged."),
          () => void publishFile(file),
        );

      void remember(exit.value.sourceId, Promise.resolve(cutout));
      setCut(cutout);
      onArtwork(exit.value);
      setJob(IDLE);
    } catch (error) {
      fail(
        error instanceof StylizeFailed ? error.message : "Couldn’t style that image. Try another.",
        () => void publishFile(file),
      );
    }
  };

  const publishRestyle = async (current: CharacterArtwork, look: ArtworkLook, to: AuthoredTeam) => {
    setJob({
      kind: "working",
      label: current.team === to ? "Restyling…" : `Restyling for ${teamLabel(to)}…`,
    });

    try {
      const cutout = await cutoutOf(current);
      const variants = await renderVariants(cutout, to, look);

      const exit = await restyle({
        payload: {
          scriptId,
          id: character.id,
          sourceId: current.sourceId,
          style: { look },
          team: to,
          variants,
        },
      });

      if (Exit.isFailure(exit))
        return fail(
          failureMessage(exit, "Couldn’t save the restyled icons. Your previous icons are kept."),
          () => void publishRestyle(current, look, to),
        );

      onArtwork(exit.value);
      setJob(IDLE);
    } catch (error) {
      fail(
        error instanceof StylizeFailed ? error.message : "Couldn’t restyle the artwork. Try again.",
        () => void publishRestyle(current, look, to),
      );
    }
  };

  // Replay the saved style once whenever the Team no longer matches the variants.
  const replayed = useRef<string | null>(null);
  const replayKey = artwork && isStale(character) ? `${artwork.sourceId}:${team}` : null;

  useEffect(() => {
    if (replayKey === null || artwork === undefined || busy || replayed.current === replayKey)
      return;
    replayed.current = replayKey;
    void publishRestyle(artwork, artwork.style.look, team);
    // Runs once per original and Team; the job state guards concurrent work.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, busy]);

  const useGeneric = async () => {
    setJob({ kind: "working", label: "Switching to generic icons…" });
    const exit = await remove({ payload: { scriptId, id: character.id } });

    if (Exit.isFailure(exit))
      return fail("Couldn’t switch to generic icons. Try again.", () => void useGeneric());

    onArtwork(undefined);
    setJob(IDLE);
  };

  const choose = (files: FileList | null) => {
    const file = files?.[0];

    if (file !== undefined && !busy) void publishFile(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  };

  const stale = isStale(character);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 border-t pt-5">
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="font-medium">
          Icon
        </h3>
        <p className="text-sm text-muted-foreground">
          {artwork === undefined
            ? "Generic icons follow the Team until you add artwork. Upload an image and Alchemist styles every alignment version."
            : stale
              ? `These icons were styled for ${teamLabel(artwork.team)}. Generic icons stand in until they are restyled for ${teamLabel(team)}.`
              : cut
                ? `Automatic cutout: ${CUTOUT_LABELS[cut.mode]}.`
                : "Your artwork, styled for each alignment."}
        </p>
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col gap-4 rounded-lg border border-dashed p-3 transition-colors",
          dragging && "border-ring bg-muted",
        )}
      >
        <ul className="flex flex-wrap gap-4" aria-label="Icon variants">
          {characterIcons(character).map(({ variant }) => (
            <li key={variant} className="flex flex-col items-center gap-1 text-xs">
              <CharacterToken character={character} variant={variant} className="size-20" />
              {ICON_VARIANT_LABELS[variant]}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={SOURCE_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              choose(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <UploadSimpleIcon />
            {artwork === undefined ? "Upload artwork" : "Replace artwork"}
          </Button>
          {artwork !== undefined && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void useGeneric()}>
              <ImageIcon />
              Use generic icons
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            PNG, JPEG, WebP or GIF up to 10 MB. You can also drop an image here.
          </span>
        </div>
      </div>
      {artwork !== undefined && (
        <LookPicker
          artwork={artwork}
          cut={cut}
          team={team}
          disabled={busy || stale}
          onChoose={(look) => void publishRestyle(artwork, look, team)}
        />
      )}
      {job.kind === "working" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" role={undefined} />
          {job.label}
        </p>
      )}
      {job.kind === "failed" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          {job.message}
          <Button variant="outline" size="sm" onClick={job.retry}>
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}

function LookPicker({
  artwork,
  cut,
  team,
  disabled,
  onChoose,
}: {
  readonly artwork: CharacterArtwork;
  readonly cut: Cutout | null;
  readonly team: AuthoredTeam;
  readonly disabled: boolean;
  readonly onChoose: (look: ArtworkLook) => void;
}) {
  const name = useId();
  const [thumbnails, setThumbnails] = useState<Partial<Record<ArtworkLook, string>>>({});

  useEffect(() => {
    if (cut === null) return setThumbnails({});

    // Rendering four previews takes a moment; let the editor paint first.
    const handle = window.setTimeout(
      () =>
        setThumbnails(
          Object.fromEntries(LOOKS.map((look) => [look, lookThumbnail(cut, team, look)])),
        ),
      0,
    );

    return () => window.clearTimeout(handle);
  }, [cut, team]);

  const label = (look: ArtworkLook) =>
    look === "auto"
      ? `Auto${cut ? ` (${LOOK_LABELS[resolveLook("auto", cut.mode)]})` : ""}`
      : LOOK_LABELS[look];

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">Look</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LOOKS.map((look) => {
          const thumbnail = thumbnails[look];

          return (
            <label
              key={look}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-xs has-checked:border-ring has-checked:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={look}
                checked={artwork.style.look === look}
                onChange={() => onChoose(look)}
                className="sr-only"
              />
              {thumbnail === undefined ? (
                <span aria-hidden="true" className="size-14 rounded-full bg-muted" />
              ) : (
                <img src={thumbnail} alt="" width={400} height={400} className="size-14" />
              )}
              {label(look)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
