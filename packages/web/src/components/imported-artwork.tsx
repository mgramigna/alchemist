import { useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { Character, ScriptId } from "@alchemist/domain";
import { AsyncResult } from "effect/reactivity";
import { importedScriptData, ScriptKeys, useGenericArtwork } from "../api.ts";
import { characterTitle } from "../lib/characters.ts";
import { Button } from "./ui/button.tsx";
import { Spinner } from "./ui/spinner.tsx";

const ARTWORK_LABELS = { image: "Character icons", logo: "Logo", background: "Background" };

/** Owner-only repair state. External sources are text, never image requests. */
export function ImportedArtworkNotice({
  scriptId,
  characters,
}: {
  readonly scriptId: ScriptId;
  readonly characters: ReadonlyArray<Character>;
}) {
  const data = useAtomValue(importedScriptData(scriptId));
  const refresh = useAtomRefresh(importedScriptData(scriptId));
  const [repair, useGeneric] = useAtom(useGenericArtwork, { mode: "promiseExit" });

  return AsyncResult.matchWithError(data, {
    onInitial: () => (
      <p role="status" className="text-sm text-muted-foreground">
        Checking imported artwork…
      </p>
    ),
    onError: () => (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        Could not check imported artwork.
        <Button variant="outline" size="sm" onClick={refresh}>
          Try again
        </Button>
      </div>
    ),
    onDefect: () => (
      <p role="alert" className="text-sm text-destructive">
        Could not check imported artwork. Reload to try again.
      </p>
    ),
    onSuccess: ({ value }) => {
      const artwork =
        value?.artwork.filter(
          (art) =>
            art.characterId === undefined ||
            characters.some((character) => character.id === art.characterId),
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
              External images have not been copied. Characters use generic icons; Script artwork is
              omitted from exports. Keep the references for later replacement, or use the defaults
              below.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {artwork.map((art) => {
              const character = characters.find((character) => character.id === art.characterId);
              const name = character ? characterTitle(character) : "Script";

              const label = ARTWORK_LABELS[art.field];

              return (
                <li
                  key={`${art.characterId ?? "script"}:${art.field}`}
                  className="flex flex-wrap items-start justify-between gap-2 border-t pt-3"
                >
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer text-sm font-medium wrap-anywhere">
                      {name} · {label} ·{" "}
                      {art.slots.some((slot) => slot.state === "failed")
                        ? "Failed reference"
                        : "Pending copy"}
                    </summary>
                    <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-xs text-muted-foreground wrap-anywhere">
                      {art.slots.map(({ source, state }, index) => (
                        <li key={index}>
                          {state === "failed" ? "Failed reference" : "Pending copy"}: {source}
                        </li>
                      ))}
                    </ol>
                  </details>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={repair.waiting}
                    aria-label={
                      art.field === "image"
                        ? `Use generic icons for ${name}`
                        : `Omit ${art.field} for ${name}`
                    }
                    onClick={() =>
                      void useGeneric({
                        payload: {
                          id: scriptId,
                          field: art.field,
                          characterId: art.characterId ?? null,
                        },
                        reactivityKeys: [`Script:imported:${scriptId}`, ScriptKeys.owned],
                      })
                    }
                  >
                    {repair.waiting && <Spinner />}
                    {art.field === "image" ? "Use generic icons" : `Omit ${art.field}`}
                  </Button>
                </li>
              );
            })}
          </ul>
          {AsyncResult.isFailure(repair) && !repair.waiting && (
            <p role="alert" className="text-sm text-destructive">
              Could not update artwork. Your references are kept; try again.
            </p>
          )}
        </section>
      );
    },
  });
}
