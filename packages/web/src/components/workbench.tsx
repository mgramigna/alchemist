import { useAtomSet } from "@effect/atom-react";
import { AuthorCredit, ScriptName, type OwnedScript, type ScriptDetails } from "@alchemist/domain";
import {
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CheckCircleIcon,
  CopyIcon,
  ScrollIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useSelector } from "@tanstack/react-form";
import { Link, useBlocker } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ScriptKeys, updateScriptDetails } from "../api.ts";
import { useAppForm } from "../hooks/form.ts";
import { scriptTitle } from "../lib/script.ts";
import { createAutosave, type Autosave, type SaveStatus } from "../lib/autosave.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { Button, buttonVariants } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Spinner } from "./ui/spinner.tsx";

const SAVE_DELAY_MS = 800;
const TEAMS = ["Townsfolk", "Outsiders", "Minions", "Demons", "Travellers"] as const;

const ScriptNameInput = Schema.toStandardSchemaV1(ScriptName);
const AuthorCreditInput = Schema.toStandardSchemaV1(AuthorCredit);

/** The owner's editor: navigator, focused form and live preview. */
export function Workbench({ script }: { readonly script: OwnedScript }) {
  const update = useAtomSet(updateScriptDetails, { mode: "promiseExit" });
  const updateRef = useRef(update);
  updateRef.current = update;

  const [autosave] = useState(() =>
    createAutosave<ScriptDetails>(
      async (details) =>
        Exit.isSuccess(
          await updateRef.current({
            payload: { id: script.id, name: details.name, authorCredit: details.authorCredit },
            reactivityKeys: [ScriptKeys.owned],
          }),
        ),
      SAVE_DELAY_MS,
    ),
  );

  const status = useSyncExternalStore(autosave.subscribe, autosave.status);

  const form = useAppForm({
    defaultValues: { name: script.name, authorCredit: script.authorCredit },
    listeners: {
      onChange: ({ formApi }) => autosave.schedule(formApi.state.values),
    },
  });

  const values = useSelector(form.store, (state) => state.values);

  const blocker = useBlocker({
    shouldBlockFn: () => autosave.status() !== "saved",
    enableBeforeUnload: () => autosave.status() !== "saved",
    withResolver: true,
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            to="/"
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"
          >
            <CaretLeftIcon className="size-3.5" />
            Your Scripts
          </Link>
          <h1 className="text-2xl font-semibold wrap-anywhere">{scriptTitle(values.name)}</h1>
        </div>
        <SaveIndicator status={status} autosave={autosave} />
      </header>
      <div className="grid gap-6 lg:grid-cols-12">
        <Navigator />
        <form.AppForm>
          <form.Form
            aria-labelledby="details-title"
            className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-5 lg:col-span-5"
          >
            <div className="flex flex-col gap-1">
              <h2 id="details-title" className="text-xl font-semibold">
                Script details
              </h2>
              <p className="text-sm text-muted-foreground">
                Changes save automatically as you type.
              </p>
            </div>
            <form.AppField name="name" validators={{ onChange: ScriptNameInput }}>
              {(field) => (
                <field.TextField label="Script name" maxLength={100} autoComplete="off" />
              )}
            </form.AppField>
            <form.AppField name="authorCredit" validators={{ onChange: AuthorCreditInput }}>
              {(field) => (
                <field.TextField
                  label="Author Credit"
                  description="Shown on the shared page and in exports. Changing your display name won’t change it."
                  maxLength={100}
                  autoComplete="off"
                />
              )}
            </form.AppField>
            <ShareLink script={script} />
          </form.Form>
        </form.AppForm>
        <Preview name={values.name} authorCredit={values.authorCredit} />
      </div>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {status === "failed"
                ? "Your latest changes couldn’t be saved. If you leave now, they’ll be lost."
                : "Your latest changes are still saving. If you leave now, they may be lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({
  status,
  autosave,
}: {
  readonly status: SaveStatus;
  readonly autosave: Autosave<ScriptDetails>;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <p role="status" className="flex items-center gap-1.5">
        {status === "saved" && (
          <>
            <CheckCircleIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">All changes saved</span>
          </>
        )}
        {status === "pending" && (
          <>
            <Spinner className="size-4" aria-hidden="true" />
            <span className="text-muted-foreground">Saving…</span>
          </>
        )}
        {status === "failed" && (
          <span className="flex items-center gap-1.5 text-destructive">
            <WarningCircleIcon className="size-4" />
            Couldn’t save your changes
          </span>
        )}
      </p>
      {status === "failed" && (
        <Button variant="outline" size="sm" onClick={autosave.retry}>
          Retry save
        </Button>
      )}
    </div>
  );
}

function Navigator() {
  return (
    <nav aria-label="Script sections" className="flex min-w-0 flex-col gap-4 text-sm lg:col-span-3">
      <ul className="flex flex-col gap-1">
        <li>
          <a
            href="#details-title"
            aria-current="page"
            className="block rounded-lg bg-muted px-3 py-2 font-medium text-foreground no-underline"
          >
            Script details
          </a>
        </li>
      </ul>
      <div className="flex flex-col gap-1">
        <h2 className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Characters
        </h2>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 px-3 text-muted-foreground lg:flex-col">
          {TEAMS.map((team) => (
            <li key={team} className="flex items-center justify-between gap-2">
              <span>{team}</span>
              <span className="tabular-nums" aria-label={`0 ${team}`}>
                0
              </span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function ShareLink({ script }: { readonly script: OwnedScript }) {
  const input = useRef<HTMLInputElement>(null);
  const url = new URL(`/scripts/${script.id}`, window.location.origin).href;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      input.current?.select();
      toast.error("Couldn’t copy automatically. The link is selected; copy it from the field.");
    }
  };

  return (
    <section aria-labelledby="share-title" className="flex flex-col gap-2 border-t pt-5">
      <h3 id="share-title" className="font-medium">
        Share link
      </h3>
      <p className="text-sm text-muted-foreground">
        Anyone with this link can view the latest saved version without signing in.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          ref={input}
          readOnly
          value={url}
          aria-label="Share link"
          className="min-w-0 flex-1 basis-56 font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={() => void copy()}>
          <CopyIcon />
          Copy link
        </Button>
        <Link
          to="/scripts/$scriptId"
          params={{ scriptId: script.id }}
          target="_blank"
          className={buttonVariants({ variant: "ghost" })}
        >
          <ArrowSquareOutIcon />
          Open shared view
        </Link>
      </div>
    </section>
  );
}

function Preview({ name, authorCredit }: { readonly name: string; readonly authorCredit: string }) {
  return (
    <aside aria-labelledby="preview-title" className="flex min-w-0 flex-col gap-3 lg:col-span-4">
      <h2 id="preview-title" className="text-sm font-medium text-muted-foreground">
        Preview
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col items-center gap-1 bg-band px-4 py-5 text-center text-band-foreground">
          <p className="font-heading text-xl wrap-anywhere">{scriptTitle(name)}</p>
          <p className="text-xs wrap-anywhere opacity-80">
            {authorCredit.trim() ? `by ${authorCredit}` : "Uncredited"}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
          <ScrollIcon className="size-6" />
          <p>Characters you add will appear on this sheet.</p>
        </div>
      </div>
    </aside>
  );
}
