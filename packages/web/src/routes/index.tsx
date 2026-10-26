import { ImportScriptButton } from "../components/import-script.tsx";
import { useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { User } from "@alchemist/domain";
import { PlusIcon, ScrollIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Exit } from "effect";
import { AsyncResult } from "effect/reactivity";
import { createScript, currentAccount, ownedScripts, ScriptKeys } from "../api.ts";
import { SignInWithGoogle } from "../components/account.tsx";
import { Button } from "../components/ui/button.tsx";
import { Spinner } from "../components/ui/spinner.tsx";
import { scriptTitle } from "../lib/script.ts";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty.tsx";
import { Skeleton } from "../components/ui/skeleton.tsx";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const account = useAtomValue(currentAccount);

  return AsyncResult.match(account, {
    onInitial: () => <HomeSkeleton />,
    // The header offers the retry; anyone can still read shared Scripts.
    onFailure: () => <Welcome />,
    onSuccess: ({ value }) => (value === null ? <Welcome /> : <Dashboard user={value} />),
  });
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-10 w-2/3 max-w-xl" />
      <Skeleton className="h-5 w-1/2 max-w-md" />
    </div>
  );
}

function Welcome() {
  return (
    <section className="flex flex-1 flex-col justify-center gap-10 py-8 md:py-16">
      <div className="flex max-w-2xl flex-col gap-5">
        <p className="text-xs font-medium tracking-brand text-accent-foreground uppercase">
          Homebrew Scripts for Blood on the Clocktower
        </p>
        <h1 className="text-4xl leading-tight font-semibold text-balance md:text-5xl">
          Every story starts with a little alchemy.
        </h1>
        <p className="text-lg text-pretty text-muted-foreground">
          Design Custom Characters, arrange both Night Orders, and share a Script your group can
          load straight into the official app.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SignInWithGoogle size="lg" />
        </div>
        <p className="text-sm text-muted-foreground">
          Have a shared Script link? Open it to see its Characters and Author Credit, no sign-in
          needed.
        </p>
      </div>
    </section>
  );
}

function Dashboard({ user }: { readonly user: User }) {
  return (
    <section className="flex flex-col gap-8" aria-labelledby="dashboard-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 id="dashboard-title" className="text-3xl font-semibold wrap-anywhere">
            Welcome back, {user.displayName}
          </h1>
          <p className="text-muted-foreground">Pick up a Script where you left off.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ImportScriptButton />
          <NewScriptButton />
        </div>
      </header>
      <ScriptList />
    </section>
  );
}

function NewScriptButton() {
  const navigate = useNavigate();
  const [result, create] = useAtom(createScript, { mode: "promiseExit" });

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        disabled={result.waiting}
        onClick={async () => {
          const exit = await create({ payload: undefined, reactivityKeys: [ScriptKeys.owned] });

          if (Exit.isSuccess(exit))
            await navigate({ to: "/scripts/$scriptId/edit", params: { scriptId: exit.value.id } });
        }}
      >
        {result.waiting ? <Spinner aria-hidden="true" /> : <PlusIcon />}
        New Script
      </Button>
      {AsyncResult.isFailure(result) && !result.waiting && (
        <p role="alert" className="text-sm text-destructive">
          Could not create a Script. Try again.
        </p>
      )}
    </div>
  );
}

function ScriptList() {
  const scripts = useAtomValue(ownedScripts);
  const refresh = useAtomRefresh(ownedScripts);

  return AsyncResult.matchWithError(scripts, {
    onInitial: () => (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your Scripts…</span>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    ),
    onError: () => <ListFailed onRetry={refresh} />,
    onDefect: () => <ListFailed onRetry={refresh} />,
    onSuccess: ({ value }) =>
      value.length === 0 ? (
        <Empty className="border border-border bg-card py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollIcon />
            </EmptyMedia>
            <EmptyTitle className="text-lg">No Scripts yet</EmptyTitle>
            <EmptyDescription>
              Create a Script to start designing Custom Characters. It saves as you go, ready to
              reopen and share.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul aria-label="Your Scripts" className="flex flex-col gap-3">
          {value.map((script) => (
            <li key={script.id}>
              <Link
                to="/scripts/$scriptId/edit"
                params={{ scriptId: script.id }}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-5 py-4 no-underline transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium wrap-anywhere">{scriptTitle(script.name)}</span>
                  <span className="text-sm text-muted-foreground wrap-anywhere">
                    {script.authorCredit.trim() ? `by ${script.authorCredit}` : "Uncredited"}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  Edited {edited.format(script.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ),
  });
}

const edited = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function ListFailed({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Empty role="alert" className="border border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          <WarningCircleIcon />
        </EmptyMedia>
        <EmptyTitle className="text-lg">Could not load your Scripts</EmptyTitle>
        <EmptyDescription>Your connection or the server may be unavailable.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  );
}
