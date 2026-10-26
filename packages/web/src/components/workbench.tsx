import { useAtomSet } from "@effect/atom-react";
import {
  AuthorCredit,
  ScriptName,
  exportBlockers,
  type AuthoredTeam,
  type Character,
  type CharacterId,
  type OwnedScript,
  type ScriptDetails,
} from "@alchemist/domain";
import {
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CheckCircleIcon,
  CopyIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useSelector } from "@tanstack/react-form";
import { Link, useBlocker } from "@tanstack/react-router";
import { cn } from "cn";
import { Exit, Schema } from "effect";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ScriptKeys, updateScriptDetails } from "../api.ts";
import { useAppForm } from "../hooks/form.ts";
import { useCharacters } from "../hooks/use-characters.ts";
import { characterTitle } from "../lib/characters.ts";
import { scriptTitle } from "../lib/script.ts";
import { createAutosave, type SaveStatus } from "../lib/autosave.ts";
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
import {
  CharacterForm,
  CharacterNavigator,
  ExportBlockerList,
  SheetPreview,
} from "./characters.tsx";
import { Button, buttonVariants } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Spinner } from "./ui/spinner.tsx";

const SAVE_DELAY_MS = 800;

const ScriptNameInput = Schema.toStandardSchemaV1(ScriptName);
const AuthorCreditInput = Schema.toStandardSchemaV1(AuthorCredit);

const combinedStatus = (...statuses: ReadonlyArray<SaveStatus>): SaveStatus =>
  statuses.includes("failed") ? "failed" : statuses.includes("pending") ? "pending" : "saved";

/** The owner's editor: navigator, focused form and live preview. */
export function Workbench({
  script,
  characters: initialCharacters,
}: {
  readonly script: OwnedScript;
  readonly characters: ReadonlyArray<Character>;
}) {
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

  const detailsStatus = useSyncExternalStore(autosave.subscribe, autosave.status);
  const roster = useCharacters(script.id, initialCharacters, SAVE_DELAY_MS);
  const status = combinedStatus(detailsStatus, roster.status);
  const unsaved = () => autosave.status() !== "saved" || roster.autosave.status() !== "saved";

  // null selects the Script details.
  const [selectedId, setSelectedId] = useState<CharacterId | null>(null);
  const [addedId, setAddedId] = useState<CharacterId | null>(null);
  const [adding, setAdding] = useState<AuthoredTeam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);

  const form = useAppForm({
    defaultValues: { name: script.name, authorCredit: script.authorCredit },
    listeners: {
      onChange: ({ formApi }) => autosave.schedule(formApi.state.values),
    },
  });

  const values = useSelector(form.store, (state) => state.values);

  const blocker = useBlocker({
    shouldBlockFn: unsaved,
    enableBeforeUnload: unsaved,
    withResolver: true,
  });

  const { characters } = roster;
  const blockers = exportBlockers(characters);
  const selected = characters.find((character) => character.id === selectedId);

  const add = async (team: AuthoredTeam) => {
    setAdding(team);

    const added = await roster.add(team);

    setAdding(null);

    if (added === undefined) {
      toast.error("Couldn’t add the Character. Try again.");

      return;
    }

    setAddedId(added.id);
    setSelectedId(added.id);
  };

  const remove = async (character: Character) => {
    if (!(await roster.remove(character.id))) {
      toast.error("Couldn’t delete the Character. Try again.");

      return;
    }

    setDeleteTarget(null);
    setSelectedId(null);
    toast.success(`Deleted ${characterTitle(character)}`);
  };

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
        <SaveIndicator
          status={status}
          retry={() => {
            autosave.retry();
            roster.autosave.retry();
          }}
        />
      </header>
      <div className="grid gap-6 lg:grid-cols-12">
        <nav
          aria-label="Script sections"
          className="flex min-w-0 flex-col gap-4 text-sm lg:col-span-3"
        >
          <button
            type="button"
            aria-current={selected === undefined ? "true" : undefined}
            onClick={() => setSelectedId(null)}
            className={cn(
              "flex flex-col rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              selected === undefined && "bg-muted",
            )}
          >
            <span className="font-medium wrap-anywhere">{scriptTitle(values.name)}</span>
            <span className="text-xs text-muted-foreground">Script details</span>
          </button>
          <CharacterNavigator
            characters={characters}
            blockers={blockers}
            selectedId={selectedId}
            adding={adding}
            onSelect={setSelectedId}
            onAdd={(team) => void add(team)}
          />
          <div className="border-t px-3 pt-3">
            {blockers.length === 0 ? (
              <p className="text-muted-foreground">Ready to export</p>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setSelectedId(null)}>
                <WarningCircleIcon />
                {blockers.length === 1
                  ? "1 problem blocks export"
                  : `${blockers.length} problems block export`}
              </Button>
            )}
          </div>
        </nav>
        {selected === undefined ? (
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
              <ExportBlockerList
                characters={characters}
                blockers={blockers}
                onSelect={setSelectedId}
              />
              <ShareLink script={script} />
            </form.Form>
          </form.AppForm>
        ) : (
          <CharacterForm
            key={selected.id}
            character={selected}
            otherNames={characters.flatMap(({ id, name }) => (id === selected.id ? [] : [name]))}
            autoFocusName={selected.id === addedId}
            onChange={(details) => roster.edit(selected.id, details)}
            onDelete={() => setDeleteTarget(selected)}
          />
        )}
        <aside
          aria-labelledby="preview-title"
          className="flex min-w-0 flex-col gap-3 lg:col-span-4"
        >
          <h2 id="preview-title" className="text-sm font-medium text-muted-foreground">
            Preview
          </h2>
          <SheetPreview
            name={values.name}
            authorCredit={values.authorCredit}
            characters={characters}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
      </div>
      <DeleteCharacterDialog
        character={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
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

function DeleteCharacterDialog({
  character,
  onCancel,
  onConfirm,
}: {
  readonly character: Character | null;
  readonly onCancel: () => void;
  readonly onConfirm: (character: Character) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={character !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Character?</AlertDialogTitle>
          <AlertDialogDescription>
            {character && characterTitle(character)} and everything written for it will be removed
            from the Script. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              if (character === null) return;
              setPending(true);
              await onConfirm(character);
              setPending(false);
            }}
          >
            {pending && <Spinner />}
            Delete Character
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SaveIndicator({
  status,
  retry,
}: {
  readonly status: SaveStatus;
  readonly retry: () => void;
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
        <Button variant="outline" size="sm" onClick={retry}>
          Retry save
        </Button>
      )}
    </div>
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
