import { useAtomValue } from "@effect/atom-react";
import type { User } from "@alchemist/domain";
import { ScrollIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { currentAccount } from "../api.ts";
import { SignInWithGoogle } from "../components/account.tsx";
import {
  Empty,
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
      <header className="flex flex-col gap-2">
        <h1 id="dashboard-title" className="text-3xl font-semibold wrap-anywhere">
          Welcome back, {user.displayName}
        </h1>
        <p className="text-muted-foreground">Your Scripts will live here.</p>
      </header>
      <Empty className="border border-border bg-card py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollIcon />
          </EmptyMedia>
          <EmptyTitle className="text-lg">No Scripts yet</EmptyTitle>
          <EmptyDescription>
            Script editing is on its way. Scripts you create will appear here, ready to edit and
            share.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}
