import { ScriptId } from "@alchemist/domain";
import { createFileRoute, Link, notFound, useCanGoBack, useRouter } from "@tanstack/react-router";
import { Effect, Option, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { AtomRegistry } from "effect/reactivity";
import { publicScript, publicScriptExport } from "../../../api.ts";
import { PublicJsonDownload } from "../../../components/public-json-download.tsx";
import { SheetPreview } from "../../../components/sheet-preview.tsx";
import { TheaterEntry, TheaterMode } from "../../../components/theater.tsx";
import { imageCredits, type ImageCredit } from "../../../lib/credits.ts";
import type { SheetView } from "../../../lib/sheets.ts";
import { parseTheaterSearch } from "../../../lib/theater.ts";
import { Button, buttonVariants } from "../../../components/ui/button.tsx";

export const Route = createFileRoute("/scripts/$scriptId/")({
  validateSearch: parseTheaterSearch,
  // Theater Mode only changes the search, which is no reason to refetch the Script.
  shouldReload: ({ cause }) => cause !== "stay",
  loader: ({ params, context, abortController }) => {
    const id = Schema.decodeOption(ScriptId)(params.scriptId);

    if (Option.isNone(id)) throw notFound();

    const query = publicScript(id.value);
    // The route owns freshness, including retry after an atom's cached failure.
    context.registry.refresh(query);
    context.registry.refresh(publicScriptExport(id.value));

    return Effect.runPromise(
      AtomRegistry.getResult(context.registry, query, { suspendOnWaiting: true }).pipe(
        Effect.catchTag("ScriptNotFound", () => Effect.fail(notFound())),
      ),
      { signal: abortController.signal },
    );
  },
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: ScriptPending,
  notFoundComponent: ScriptNotFound,
  errorComponent: ScriptError,
  component: PublicScript,
});

function ScriptPending() {
  return (
    <section className="flex flex-col gap-4" role="status">
      <h1 className="text-3xl font-semibold">Loading Script…</h1>
      <p>Fetching the latest saved Script.</p>
    </section>
  );
}

function ScriptNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-semibold">Script not found</h1>
      <p>
        This link may be incorrect, or the Script may have been deleted. Ask the Script Owner for a
        current link.
      </p>
      <Link className={buttonVariants({ variant: "outline" })} to="/">
        Go home
      </Link>
    </section>
  );
}

function ScriptError() {
  const router = useRouter();

  return (
    <section className="flex flex-col items-start gap-4" role="alert">
      <h1 className="text-3xl font-semibold">We couldn’t load this Script</h1>
      <p>Your connection or the server may be unavailable. Try again in a moment.</p>
      <Button variant="outline" onClick={() => void router.invalidate()}>
        Try again
      </Button>
    </section>
  );
}

function PublicScript() {
  const script = Route.useLoaderData();
  const [view, setView] = useState<SheetView>("characters");
  const { theater, night } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const leaving = useRef(false);

  // Entering pushes a history entry, so Back (Android's especially) closes it.
  const enterTheater = () => void navigate({ search: { theater: true } });

  // Undoes that entry. A shared link has none to undo, so it stays on the Script instead.
  const exitTheater = () => {
    if (leaving.current) return;

    leaving.current = true;

    if (canGoBack) router.history.back();
    else void navigate({ search: {}, replace: true });
  };

  // Going back takes a moment; a second click in that gap must not leave the Script too.
  useEffect(() => {
    leaving.current = false;
  }, [theater]);

  const hasCharacters = script.characters.length > 0;

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Shared Script · Read only</p>
        {script.artwork.logo !== null && (
          <img
            src={script.artwork.logo}
            alt={`${script.name || "Untitled Script"} logo`}
            className="max-h-32 w-fit max-w-full object-contain"
          />
        )}
        <h1 className="text-3xl font-semibold wrap-anywhere">{script.name || "Untitled Script"}</h1>
        <p className="wrap-anywhere">By {script.authorCredit || "Uncredited"}</p>
      </header>
      <p className="text-sm text-muted-foreground">
        This link shows the latest saved Script. Reload to see new changes from the Script Owner.
      </p>
      {!hasCharacters ? (
        <section
          aria-label="Sheets"
          className="flex flex-col gap-3 rounded border border-border px-5 py-12 text-center"
        >
          <h2 className="text-xl font-medium">A story waiting for its Characters</h2>
          <p>This Script has no Characters yet.</p>
          <p className="text-muted-foreground">Come back when the Script Owner has added some.</p>
        </section>
      ) : (
        <section aria-labelledby="sheets-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sheets-title" className="text-xl font-semibold">
              Sheets
            </h2>
            <TheaterEntry onEnter={enterTheater} />
          </div>
          <SheetPreview content={script} view={view} onViewChange={setView} />
        </section>
      )}
      <PublicJsonDownload key={script.id} script={script} />
      <ImageCredits credits={imageCredits(script)} />
      {hasCharacters && (
        <TheaterMode
          script={script}
          open={theater === true}
          night={night === true}
          onNightChange={(next) =>
            void navigate({
              search: (previous) => ({ ...previous, night: next ? true : undefined }),
              replace: true,
            })
          }
          onExit={exitTheater}
        />
      )}
    </article>
  );
}

// Printed sheets link here, so credits stay with the images however they are shared.
function ImageCredits({ credits }: { readonly credits: ReadonlyArray<ImageCredit> }) {
  if (credits.length === 0) return null;

  return (
    <section aria-labelledby="credits-title" className="flex flex-col gap-3">
      <h2 id="credits-title" className="text-xl font-semibold">
        Image credits
      </h2>
      <dl className="flex flex-col gap-2 text-sm">
        {credits.map(({ key, subject, credit }) => (
          <div key={key} className="flex flex-col">
            <dt className="font-medium">{subject}</dt>
            <dd className="wrap-anywhere text-muted-foreground">{credit}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
