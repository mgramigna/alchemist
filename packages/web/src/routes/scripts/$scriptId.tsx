import { ScriptId } from "@alchemist/domain";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { Effect, Option, Schema } from "effect";
import { AtomRegistry } from "effect/reactivity";
import { publicScript } from "../../api.ts";

export const Route = createFileRoute("/scripts/$scriptId")({
  loader: ({ params, context, abortController }) => {
    const id = Schema.decodeUnknownOption(ScriptId)(params.scriptId);

    if (Option.isNone(id)) throw notFound();

    const query = publicScript(id.value);
    // The route owns freshness, including retry after an atom's cached failure.
    context.registry.refresh(query);

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
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Script not found</h1>
      <p>
        This link may be incorrect, or the Script may have been deleted. Ask the Script Owner for a
        current link.
      </p>
      <Link className="underline" to="/">
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
      <button
        type="button"
        className="rounded border px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-4"
        onClick={() => void router.invalidate()}
      >
        Try again
      </button>
    </section>
  );
}

function PublicScript() {
  const script = Route.useLoaderData();

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Shared Script · Read only</p>
        <h1 className="text-3xl font-semibold wrap-anywhere">{script.name || "Untitled Script"}</h1>
        <p className="wrap-anywhere">By {script.authorCredit || "Uncredited"}</p>
      </header>
      <section className="rounded border border-slate-200" aria-labelledby="characters-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <h2 id="characters-title" className="text-xl font-semibold">
            Characters
          </h2>
          <span className="text-sm text-slate-600">{script.characters.length} Characters</span>
        </div>
        <div className="flex flex-col gap-3 px-5 py-12 text-center">
          <h3 className="text-xl font-medium">A story waiting for its Characters</h3>
          <p>This Script has no Characters yet.</p>
          <p className="text-slate-600">Come back when the Script Owner has added some.</p>
        </div>
      </section>
    </article>
  );
}
