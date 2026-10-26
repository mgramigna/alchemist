import { ScriptId } from "@alchemist/domain";
import { LockIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { Effect, Option, Schema } from "effect";
import { AtomRegistry } from "effect/reactivity";
import { ownedJinxes, ownedCharacters, ownedNightOrders, ownedScript } from "../../../api.ts";
import { SignInWithGoogle } from "../../../components/account.tsx";
import { Button, buttonVariants } from "../../../components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../../components/ui/empty.tsx";
import { Skeleton } from "../../../components/ui/skeleton.tsx";
import { Workbench } from "../../../components/workbench.tsx";

export const Route = createFileRoute("/scripts/$scriptId/edit")({
  staticData: { wide: true },
  loader: ({ params, context, abortController }) => {
    const id = Schema.decodeOption(ScriptId)(params.scriptId);

    if (Option.isNone(id)) throw notFound();

    const script = ownedScript(id.value);
    const characters = ownedCharacters(id.value);
    const jinxes = ownedJinxes(id.value);
    const nightOrders = ownedNightOrders(id.value);
    // Reopening always starts from the latest saved state.
    context.registry.refresh(script);
    context.registry.refresh(characters);
    context.registry.refresh(nightOrders);
    context.registry.refresh(jinxes);

    return Effect.runPromise(
      Effect.all({
        jinxes: AtomRegistry.getResult(context.registry, jinxes, { suspendOnWaiting: true }),
        script: AtomRegistry.getResult(context.registry, script, { suspendOnWaiting: true }),
        characters: AtomRegistry.getResult(context.registry, characters, {
          suspendOnWaiting: true,
        }),
        nightOrders: AtomRegistry.getResult(context.registry, nightOrders, {
          suspendOnWaiting: true,
        }),
      }).pipe(
        // Missing and someone else's Scripts look the same to the Workbench.
        Effect.catchTags({
          ScriptNotFound: () => Effect.fail(notFound()),
          AuthRejected: () => Effect.succeed(null),
        }),
      ),
      { signal: abortController.signal },
    );
  },
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: WorkbenchPending,
  notFoundComponent: WorkbenchNotFound,
  errorComponent: WorkbenchError,
  component: EditScript,
});

function EditScript() {
  const loaded = Route.useLoaderData();

  return loaded === null ? (
    <SignedOut />
  ) : (
    <Workbench
      key={loaded.script.id}
      script={loaded.script}
      characters={loaded.characters}
      nightOrders={loaded.nightOrders}
      jinxes={loaded.jinxes}
    />
  );
}

function WorkbenchPending() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Opening Script…</span>
      <Skeleton className="h-8 w-1/2 max-w-sm" />
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-40 lg:col-span-3 xl:col-span-2" />
        <Skeleton className="h-72 lg:col-span-5" />
        <Skeleton className="h-72 lg:col-span-4 xl:col-span-5" />
      </div>
    </div>
  );
}

function SignedOut() {
  return (
    <Empty className="border border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockIcon />
        </EmptyMedia>
        <EmptyTitle className="text-lg">Sign in to edit this Script</EmptyTitle>
        <EmptyDescription>Only the Script Owner can open it in the Workbench.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <SignInWithGoogle />
      </EmptyContent>
    </Empty>
  );
}

function WorkbenchNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-semibold">Script not found</h1>
      <p>
        This Script may have been deleted, or it belongs to a different account. Scripts you own are
        listed on your home page.
      </p>
      <Link className={buttonVariants({ variant: "outline" })} to="/">
        Your Scripts
      </Link>
    </section>
  );
}

function WorkbenchError() {
  const router = useRouter();

  return (
    <section className="flex flex-col items-start gap-4" role="alert">
      <h1 className="text-3xl font-semibold">We couldn’t open this Script</h1>
      <p>Your connection or the server may be unavailable. Try again in a moment.</p>
      <Button variant="outline" onClick={() => void router.invalidate()}>
        Try again
      </Button>
    </section>
  );
}
