import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import type { User } from "@alchemist/domain";
import { DisplayName } from "@alchemist/domain";
import { SignOutIcon, UserCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { toast } from "sonner";
import { currentAccount, renameAccount } from "../api.ts";
import { SignInWithGoogle, UserAvatar } from "../components/account.tsx";
import { Button } from "../components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty.tsx";
import { Skeleton } from "../components/ui/skeleton.tsx";
import { useAppForm } from "../hooks/form.ts";

// Validates what the user typed; the trimmed name is what gets saved.
const DisplayNameInput = Schema.toStandardSchemaV1(Schema.Trim.pipe(Schema.decodeTo(DisplayName)));

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Account</h1>
        <p className="text-muted-foreground">Manage how you appear in Alchemist.</p>
      </header>
      <AccountSettings />
    </div>
  );
}

function AccountSettings() {
  const account = useAtomValue(currentAccount);
  const refresh = useAtomRefresh(currentAccount);

  return AsyncResult.matchWithError(account, {
    onInitial: () => (
      <div role="status" className="flex flex-col gap-6">
        <span className="sr-only">Checking your session…</span>
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    ),
    onError: () => <LoadFailed onRetry={refresh} />,
    onDefect: () => <LoadFailed onRetry={refresh} />,
    onSuccess: ({ value }) =>
      value === null ? (
        <SignedOut />
      ) : (
        <div className="flex flex-col gap-6">
          <ProfileCard key={value.id} user={value} />
          <SessionCard />
        </div>
      ),
  });
}

function LoadFailed({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Empty role="alert" className="border border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          <WarningCircleIcon />
        </EmptyMedia>
        <EmptyTitle className="text-lg">Could not load your account</EmptyTitle>
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

function SignedOut() {
  return (
    <Empty className="border border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UserCircleIcon />
        </EmptyMedia>
        <EmptyTitle className="text-lg">You’re signed out</EmptyTitle>
        <EmptyDescription>Sign in to choose the name shown on your Scripts.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <SignInWithGoogle />
      </EmptyContent>
    </Empty>
  );
}

function ProfileCard({ user }: { readonly user: User }) {
  const rename = useAtomSet(renameAccount, { mode: "promiseExit" });
  const [saveFailed, setSaveFailed] = useState(false);

  const form = useAppForm({
    defaultValues: { displayName: user.displayName },
    onSubmit: async ({ value }) => {
      setSaveFailed(false);

      const result = await rename({
        payload: { displayName: value.displayName.trim() },
        reactivityKeys: ["Account"],
      });

      if (Exit.isFailure(result)) {
        setSaveFailed(true);
      } else {
        form.reset({ displayName: result.value.displayName });
        toast.success("Display name saved");
      }
    },
  });

  return (
    <Card>
      <form.AppForm>
        <form.Form className="flex flex-col gap-(--card-spacing)" aria-labelledby="profile-title">
          <CardHeader className="border-b">
            <div className="flex items-center gap-3">
              <UserAvatar user={user} size="lg" />
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle id="profile-title" className="text-lg">
                  Profile
                </CardTitle>
                <CardDescription>Your name across Alchemist.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form.AppField name="displayName" validators={{ onChange: DisplayNameInput }}>
              {(field) => (
                <field.TextField
                  label="Display name"
                  description="Used as the starting Author Credit on new Scripts. Changing it won’t update Scripts you’ve already made."
                  maxLength={100}
                  autoComplete="nickname"
                />
              )}
            </form.AppField>
          </CardContent>
          <CardFooter className="flex-wrap justify-end gap-3">
            {saveFailed && (
              <p
                role="alert"
                className="mr-auto flex items-center gap-1.5 text-sm text-destructive"
              >
                <WarningCircleIcon className="size-4 shrink-0" />
                Could not save your name. Try again, or sign in again if your session expired.
              </p>
            )}
            <form.SubmitButton requireChanges pendingLabel="Saving…">
              Save display name
            </form.SubmitButton>
          </CardFooter>
        </form.Form>
      </form.AppForm>
    </Card>
  );
}

function SessionCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Session</CardTitle>
        <CardDescription>
          Signed in with Google. This browser stays signed in for 30 days; signing out here doesn’t
          affect your other devices.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <form method="post" action="/auth/sign-out">
          <Button type="submit" variant="outline">
            <SignOutIcon />
            Sign out of this browser
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
