import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  needsRepair,
  type Character,
  type CharacterArtwork,
  type CharacterId,
  type ImportedArtwork,
  type ScriptArtwork,
  type ScriptId,
} from "@alchemist/domain";
import { Cause, Exit, Predicate, Result } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { toast } from "sonner";
import { importedScriptData, retryImportedArtwork, ScriptKeys, useGenericArtwork } from "../api.ts";
import { characterTitle } from "../lib/characters.ts";
import { Button } from "./ui/button.tsx";
import { Spinner } from "./ui/spinner.tsx";

const ARTWORK_LABELS = { image: "Character icons", logo: "Logo", background: "Background" };

const keyOf = (art: ImportedArtwork) => `${art.characterId ?? "script"}:${art.field}`;

const SLOT_LABELS = { pending: "Not copied yet", copied: "Copied", failed: "Couldn’t copy" };

const copiedSummary = (art: ImportedArtwork) => {
  const copied = art.slots.filter((slot) => slot.state === "copied").length;

  return art.slots.length === 1
    ? SLOT_LABELS[art.slots[0]?.state ?? "pending"]
    : `${copied} of ${art.slots.length} images copied`;
};

type Job =
  | { readonly kind: "working"; readonly label: string }
  | { readonly kind: "done"; readonly message: string }
  | { readonly kind: "failed"; readonly message: string };

const conflicted = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) return false;
  const error = Cause.findError(exit.cause);

  return Result.isSuccess(error) && Predicate.isTagged(error.success, "ArtworkConflict");
};

/**
 * Owner-only repair for imported images that were not copied. External
 * sources are shown as text and never requested by the browser.
 */
export function ImportedArtworkNotice({
  scriptId,
  characters,
  onCharacterArtwork,
  onScriptArtwork,
  onOpen,
}: {
  readonly scriptId: ScriptId;
  readonly characters: ReadonlyArray<Character>;
  readonly onCharacterArtwork: (id: CharacterId, artwork: CharacterArtwork | undefined) => void;
  readonly onScriptArtwork: (artwork: ScriptArtwork) => void;
  // Opens the editor where this artwork can be replaced: a Character, or the Script (null).
  readonly onOpen: (id: CharacterId | null) => void;
}) {
  const data = useAtomValue(importedScriptData(scriptId));
  const refresh = useAtomRefresh(importedScriptData(scriptId));
  const retry = useAtomSet(retryImportedArtwork, { mode: "promiseExit" });
  const useGeneric = useAtomSet(useGenericArtwork, { mode: "promiseExit" });
  const [jobs, setJobs] = useState<Readonly<Record<string, Job>>>({});
  const busy = Object.values(jobs).some((job) => job.kind === "working");

  const setJob = (key: string, job: Job) => setJobs((current) => ({ ...current, [key]: job }));

  const reactivityKeys = [`Script:imported:${scriptId}`, ScriptKeys.owned];

  const retryCopy = async (art: ImportedArtwork, name: string, what: string) => {
    const key = keyOf(art);
    setJob(key, { kind: "working", label: "Copying…" });

    const exit = await retry({
      payload: { id: scriptId, field: art.field, characterId: art.characterId ?? null },
      reactivityKeys,
    });

    if (Exit.isFailure(exit))
      return setJob(key, {
        kind: "failed",
        message: conflicted(exit)
          ? "This artwork changed in another tab. Reload to see the latest version."
          : `Couldn’t copy ${name}’s artwork. Your references are kept; try again.`,
      });

    const { reference, characterArtwork, scriptArtwork } = exit.value;

    if (art.characterId !== undefined) onCharacterArtwork(art.characterId, characterArtwork);
    else onScriptArtwork(scriptArtwork);
    const missing = reference.slots.filter((slot) => slot.state !== "copied").length;

    // A fully copied item leaves the list, so confirm it outside the list.
    if (missing === 0) toast.success(`Copied ${what}`);
    setJob(key, {
      kind: "done",
      message:
        missing === 0
          ? ""
          : `Still couldn’t copy ${missing === 1 ? "1 image" : `${missing} images`}.`,
    });
  };

  const fallBack = async (art: ImportedArtwork, character: Character | undefined) => {
    const key = keyOf(art);
    setJob(key, { kind: "working", label: art.field === "image" ? "Switching…" : "Omitting…" });

    const exit = await useGeneric({
      payload: { id: scriptId, field: art.field, characterId: art.characterId ?? null },
      reactivityKeys,
    });

    if (Exit.isFailure(exit))
      return setJob(key, {
        kind: "failed",
        message: "Couldn’t update artwork. Your references are kept; try again.",
      });

    // Only imported icons go with the reference; uploads were never affected.
    if (character?.artwork?.imported) onCharacterArtwork(character.id, undefined);
    setJob(key, { kind: "done", message: "" });
  };

  return AsyncResult.matchWithError(data, {
    onInitial: () => (
      <p role="status" className="text-sm text-muted-foreground">
        Checking imported artwork…
      </p>
    ),
    onError: () => (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        Couldn’t check imported artwork.
        <Button variant="outline" size="sm" onClick={refresh}>
          Try again
        </Button>
      </div>
    ),
    onDefect: () => (
      <p role="alert" className="text-sm text-destructive">
        Couldn’t check imported artwork. Reload to try again.
      </p>
    ),
    onSuccess: ({ value }) => {
      const artwork =
        value?.artwork.filter(
          (art) =>
            needsRepair(art) &&
            (art.characterId === undefined ||
              characters.some((character) => character.id === art.characterId)),
        ) ?? [];

      if (!artwork.length) return null;

      return (
        <section
          className="flex flex-col gap-3 rounded-xl border bg-card p-4"
          aria-label="Imported artwork"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Imported artwork needs attention</h2>
            <p className="text-sm text-muted-foreground">
              Some imported images couldn’t be copied into Alchemist. Copied images are kept
              unchanged. Missing Character icons use generic icons in their slots, and missing
              Script artwork is left out of exports. Retry, replace the image, or use the defaults.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {artwork.map((art) => {
              const character = characters.find((character) => character.id === art.characterId);
              const name = character ? characterTitle(character) : "Script";
              const label = ARTWORK_LABELS[art.field];
              const what = art.field === "image" ? `icons for ${name}` : `${art.field} for ${name}`;
              const job = jobs[keyOf(art)];

              return (
                <li key={keyOf(art)} className="flex flex-col gap-2 border-t pt-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-sm font-medium wrap-anywhere">
                        {name} · {label} · {copiedSummary(art)}
                      </summary>
                      <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-xs text-muted-foreground wrap-anywhere">
                        {art.slots.map(({ source, state, problem }, index) => (
                          <li key={index}>
                            <span className="font-medium text-foreground">
                              {SLOT_LABELS[state]}
                            </span>
                            {problem && `: ${problem}`} <span>({source})</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Retry copying ${what}`}
                        onClick={() => void retryCopy(art, name, what)}
                      >
                        {job?.kind === "working" && job.label === "Copying…" && (
                          <Spinner aria-hidden="true" role={undefined} />
                        )}
                        Retry
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Replace ${what}`}
                        onClick={() => onOpen(art.characterId ?? null)}
                      >
                        Replace…
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={
                          art.field === "image"
                            ? `Use generic icons for ${name}`
                            : `Omit ${art.field} for ${name}`
                        }
                        onClick={() => void fallBack(art, character)}
                      >
                        {job?.kind === "working" && job.label !== "Copying…" && (
                          <Spinner aria-hidden="true" role={undefined} />
                        )}
                        {art.field === "image" ? "Use generic icons" : `Omit ${art.field}`}
                      </Button>
                    </div>
                  </div>
                  {job?.kind === "working" && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {job.label}
                    </p>
                  )}
                  {job?.kind === "done" && job.message && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {job.message}
                    </p>
                  )}
                  {job?.kind === "failed" && (
                    <p role="alert" className="text-sm text-destructive">
                      {job.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      );
    },
  });
}
