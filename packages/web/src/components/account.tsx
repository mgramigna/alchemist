import { useAtomValue, useAtomRefresh, useAtomSet } from "@effect/atom-react";
import { useForm } from "@tanstack/react-form";
import type { User } from "@alchemist/domain";
import { DisplayName } from "@alchemist/domain";
import { Exit, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { currentAccount, renameAccount } from "../api.ts";
import { Button, buttonVariants } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

export function Account() {
  const account = useAtomValue(currentAccount);
  const refresh = useAtomRefresh(currentAccount);

  return AsyncResult.matchWithError(account, {
    onInitial: () => <p role="status">Checking your session…</p>,
    onError: () => (
      <div role="alert">
        <p>Could not load your account.</p>
        <Button onClick={refresh}>Try again</Button>
      </div>
    ),
    onDefect: () => (
      <div role="alert">
        <p>Something went wrong loading your account.</p>
        <Button onClick={refresh}>Try again</Button>
      </div>
    ),
    onSuccess: ({ value }) =>
      value === null ? (
        <a className={buttonVariants({ variant: "outline" })} href="/auth/google">
          <img src="/google.svg" alt="" width={16} height={16} />
          Sign in with Google
        </a>
      ) : (
        <AccountForm key={value.id} user={value} />
      ),
  });
}

function AccountForm({ user }: { readonly user: User }) {
  const rename = useAtomSet(renameAccount, { mode: "promiseExit" });
  const [status, setStatus] = useState("");

  const form = useForm({
    defaultValues: { displayName: user.displayName },
    onSubmit: async ({ value }) => {
      setStatus("");

      const result = await rename({
        payload: { displayName: value.displayName.trim() },
        reactivityKeys: ["Account"],
      });

      if (Exit.isFailure(result)) {
        setStatus(
          "Could not save your name. Your session may have expired. Try again or sign in again.",
        );
      } else {
        form.reset({ displayName: result.value.displayName });
        setStatus("Display name saved.");
      }
    },
  });

  return (
    <section className="flex w-full max-w-sm flex-col gap-4" aria-label="Your account">
      <h2 className="text-xl font-semibold">Your account</h2>
      <p>Signed in as {user.displayName}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="displayName"
          validators={{
            onChange: ({ value }) =>
              Schema.is(DisplayName)(value.trim())
                ? undefined
                : "Enter a name between 1 and 100 characters.",
          }}
        >
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                name={field.name}
                value={field.state.value}
                maxLength={100}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby="display-name-help"
              />
              <p id="display-name-help" className="text-sm">
                {field.state.meta.errors.join(" ") ||
                  "Used as the initial Author Credit for new Scripts."}
              </p>
            </div>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit, submitting]) => (
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Saving…" : "Save display name"}
            </Button>
          )}
        </form.Subscribe>
        <p role="status">{status}</p>
      </form>
      <form method="post" action="/auth/sign-out">
        <Button type="submit" variant="outline">
          Sign out of this browser
        </Button>
      </form>
    </section>
  );
}
