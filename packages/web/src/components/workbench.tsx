import { ImportedArtworkNotice } from "./imported-artwork.tsx";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  type Jinx,
  scriptExportProblems,
  AuthorCredit,
  NIGHTS,
  ScriptName,
  addBeforeDawn,
  removeEntry,
  type AuthoredTeam,
  type Character,
  type CharacterId,
  type Night,
  type NightOrders,
  type OwnedScript,
  type ScriptDetails,
} from "@alchemist/domain";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useSelector } from "@tanstack/react-form";
import { Link, useBlocker } from "@tanstack/react-router";
import { cn } from "cn";
import { Cause, Exit, Predicate, Result, Schema } from "effect";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  ScriptKeys,
  updateScriptDetails,
  exportScript,
  createCharacter,
  deleteCharacter,
  createJinx,
  deleteJinx,
} from "../api.ts";
import { useAppForm } from "../hooks/form.ts";
import { useJinxes } from "../hooks/use-jinxes.ts";
import { JinxEditor } from "./jinxes.tsx";
import { useCharacters } from "../hooks/use-characters.ts";
import { useNightOrders } from "../hooks/use-night-orders.ts";
import { downloadBlob } from "../lib/download.ts";
import { characterTitle } from "../lib/characters.ts";
import { fieldLabel } from "../lib/fields.ts";
import { NIGHT_LABELS } from "../lib/night.ts";
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
import { CharacterArtworkEditor } from "./character-artwork.tsx";
import { CharacterForm, CharacterNavigator, ExportBlockerList } from "./characters.tsx";
import { NightOrderEditor } from "./night-orders.tsx";
import { SheetPreview } from "./sheet-preview.tsx";
import { sheetShowing, type SheetView } from "../lib/sheets.ts";
import { Button, buttonVariants } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Spinner } from "./ui/spinner.tsx";

const SAVE_DELAY_MS = 800;

const ScriptNameInput = Schema.toStandardSchemaV1(ScriptName);
const AuthorCreditInput = Schema.toStandardSchemaV1(AuthorCredit);

const combinedStatus = (...statuses: ReadonlyArray<SaveStatus>): SaveStatus =>
  statuses.includes("failed") ? "failed" : statuses.includes("pending") ? "pending" : "saved";

// What the centre pane is editing.
type Page =
  | { readonly kind: "script" }
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "night"; readonly night: Night };

/** The owner's editor: navigator, focused form and live preview. */
export function Workbench({
  script,
  characters: initialCharacters,
  nightOrders: initialNightOrders,
  jinxes: initialJinxes,
}: {
  readonly script: OwnedScript;
  readonly characters: ReadonlyArray<Character>;
  readonly nightOrders: NightOrders;
  readonly jinxes: ReadonlyArray<Jinx>;
}) {
  const getExport = useAtomSet(exportScript, { mode: "promiseExit" });
  const creatingCharacter = useAtomValue(createCharacter);
  const deletingCharacter = useAtomValue(deleteCharacter);
  const creatingJinx = useAtomValue(createJinx);
  const deletingJinx = useAtomValue(deleteJinx);

  const structuralPending =
    creatingCharacter.waiting ||
    deletingCharacter.waiting ||
    creatingJinx.waiting ||
    deletingJinx.waiting;

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
  const nights = useNightOrders(script.id, initialNightOrders, SAVE_DELAY_MS);
  const relationships = useJinxes(script.id, initialJinxes, SAVE_DELAY_MS);
  const status = combinedStatus(detailsStatus, roster.status, nights.status, relationships.status);

  const unsaved = () =>
    [autosave, roster.autosave, nights.autosave, relationships.autosave].some(
      (saver) => saver.status() !== "saved",
    );

  const [page, setPage] = useState<Page>({ kind: "script" });
  const [preview, setPreview] = useState<SheetView>("characters");
  const selectedId = page.kind === "character" ? page.id : null;

  // null selects the Script details. The preview turns to a sheet showing the Character.
  const setSelectedId = (id: CharacterId | null) => {
    setPage(id === null ? { kind: "script" } : { kind: "character", id });

    if (id !== null) setPreview((current) => sheetShowing(current, id, nights.orders));
  };

  // Opening a night also shows its sheet in the preview.
  const openNight = (night: Night) => {
    setPage({ kind: "night", night });
    setPreview(night);
  };

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

  const problems = scriptExportProblems({
    script: values,
    characters,
    nightOrders: nights.orders,
    jinxes: relationships.jinxes,
  });

  const blockers = problems.flatMap((problem) => {
    const character = characters.find((c) => c.id === problem.characterId);

    return character === undefined ? [] : [{ ...problem, characterId: character.id }];
  });

  const scriptProblems = problems.filter((problem) => problem.characterId === undefined);

  const exportJson = async (action: "copy" | "download") => {
    if (unsaved() || structuralPending) {
      setExportError(
        "Wait for all changes to save, then retry the export. If saving failed, use Retry save first.",
      );

      return;
    }

    if (problems.length) {
      setSelectedId(null);

      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const exit = await getExport({ payload: { id: script.id } });

      if (Exit.isFailure(exit)) {
        const error = Cause.findError(exit.cause);
        setExportError(
          Result.isSuccess(error) && Predicate.isTagged(error.success, "ScriptExportInvalid")
            ? error.success.problems
                .map((problem) => `${problem.field}: ${problem.message}`)
                .join(" ")
            : "Couldn’t export the saved Script. Try again.",
        );

        return;
      }

      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(exit.value.json);
          toast.success("JSON copied to clipboard");
        } catch {
          setExportError("Couldn’t copy the JSON. Try again or download it instead.");
        }
      } else {
        downloadBlob(
          new Blob([exit.value.json], { type: "application/json" }),
          exit.value.filename,
        );
      }
    } finally {
      setExporting(false);
    }
  };

  const selected = characters.find((character) => character.id === selectedId);

  const add = async (team: AuthoredTeam, chosen: ReadonlyArray<Night>) => {
    setAdding(team);

    const added = await roster.add(team, chosen);

    setAdding(null);

    if (added === undefined) {
      toast.error("Couldn’t add the Character. Try again.");

      return;
    }

    nights.created(added.id, chosen);
    setAddedId(added.id);
    setSelectedId(added.id);
  };

  const remove = async (character: Character) => {
    if (!(await roster.remove(character.id))) {
      toast.error("Couldn’t delete the Character. Try again.");

      return;
    }

    nights.deleted(character.id);
    relationships.deletedCharacter(character.id);
    setDeleteTarget(null);
    setSelectedId(null);
    toast.success(`Deleted ${characterTitle(character)}`);
  };

  return (
    <fieldset aria-busy={exporting} disabled={exporting} className="flex min-w-0 flex-col gap-6">
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
            nights.autosave.retry();
            relationships.autosave.retry();
          }}
        />
      </header>
      <ImportedArtworkNotice scriptId={script.id} characters={roster.characters} />
      <div className="grid gap-6 lg:grid-cols-12">
        <nav
          aria-label="Script sections"
          className="flex min-w-0 flex-col gap-4 text-sm lg:col-span-3 xl:col-span-2"
        >
          <button
            type="button"
            aria-current={page.kind === "script" ? "true" : undefined}
            onClick={() => setSelectedId(null)}
            className={cn(
              "flex flex-col rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              page.kind === "script" && "bg-muted",
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
            onAdd={(team, chosen) => void add(team, chosen)}
          />
          <section aria-labelledby="nights-nav" className="flex flex-col gap-0.5">
            <h2
              id="nights-nav"
              className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              Night Orders
            </h2>
            <ul aria-label="Night Orders" className="flex flex-col gap-0.5">
              {NIGHTS.map((night) => {
                const current = page.kind === "night" && page.night === night;

                return (
                  <li key={night}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => openNight(night)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        current && "bg-muted font-medium",
                      )}
                    >
                      {NIGHT_LABELS[night]}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {nights.orders[night].length} entries
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="flex flex-col items-start gap-2 border-t px-3 pt-3">
            {problems.length === 0 ? (
              <p className="text-muted-foreground">Ready to export</p>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setSelectedId(null)}>
                <WarningCircleIcon />
                {problems.length === 1
                  ? "1 problem blocks export"
                  : `${problems.length} problems block export`}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" disabled={exporting} />}>
                {exporting ? <Spinner /> : <CopyIcon />}
                Export JSON
                <CaretDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem onClick={() => void exportJson("copy")}>
                  <CopyIcon />
                  Copy JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportJson("download")}>
                  <DownloadSimpleIcon />
                  Download JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {(status !== "saved" || structuralPending) && (
              <p className="text-sm text-muted-foreground">
                Save all changes before exporting. Retry failed saves first.
              </p>
            )}
            {exportError && (
              <p role="alert" className="text-sm text-destructive">
                {exportError}
              </p>
            )}
          </div>
        </nav>
        {page.kind === "night" ? (
          <NightOrderEditor
            key={page.night}
            night={page.night}
            order={nights.orders[page.night]}
            characters={characters}
            onChange={(order) => nights.replace(page.night, order)}
            onSelect={setSelectedId}
          />
        ) : selected === undefined ? (
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
                  <field.TextField
                    id="script-name"
                    label="Script name"
                    maxLength={100}
                    autoComplete="off"
                  />
                )}
              </form.AppField>
              <form.AppField name="authorCredit" validators={{ onChange: AuthorCreditInput }}>
                {(field) => (
                  <field.TextField
                    id="script-authorCredit"
                    label="Author Credit"
                    description="Shown on the shared page and in exports. Changing your display name won’t change it."
                    maxLength={100}
                    autoComplete="off"
                  />
                )}
              </form.AppField>
              {scriptProblems.length > 0 && (
                <ul
                  aria-label="Script export problems"
                  className="flex flex-col gap-2 text-sm text-destructive"
                >
                  {scriptProblems.map((problem) => (
                    <li key={`${problem.field}-${problem.message}`}>
                      <button
                        type="button"
                        className="text-left underline"
                        onClick={() => {
                          if (problem.field === "firstNight" || problem.field === "otherNight")
                            openNight(problem.field);
                          else if (problem.field === "name" || problem.field === "authorCredit")
                            document.getElementById(`script-${problem.field}`)?.focus();
                          else if (problem.field === "characters")
                            document
                              .querySelector<HTMLButtonElement>(
                                'button[aria-label="Add Townsfolk"]',
                              )
                              ?.focus();
                        }}
                      >
                        {problem.field === "name" ? "Script name" : fieldLabel(problem.field)}:{" "}
                        {problem.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
            jinxEditor={
              <JinxEditor
                characterId={selected.id}
                characters={characters}
                jinxes={relationships.jinxes}
                onAdd={relationships.add}
                onChange={relationships.edit}
                onDelete={relationships.remove}
              />
            }
            iconEditor={
              <CharacterArtworkEditor
                scriptId={script.id}
                character={selected}
                onArtwork={(artwork) => roster.setArtwork(selected.id, artwork)}
              />
            }
            character={selected}
            characters={characters}
            nightOrders={nights.orders}
            autoFocusName={selected.id === addedId}
            onChange={(details) => roster.edit(selected.id, details)}
            onDelete={() => setDeleteTarget(selected)}
            onToggleNight={(night, member) =>
              nights.replace(
                night,
                member
                  ? addBeforeDawn(nights.orders[night], selected.id)
                  : removeEntry(nights.orders[night], selected.id),
              )
            }
            onOpenNight={openNight}
          />
        )}
        <aside
          aria-labelledby="preview-title"
          className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:col-span-4 lg:self-start xl:col-span-5"
        >
          <h2 id="preview-title" className="text-sm font-medium text-muted-foreground">
            Preview
          </h2>
          {characters.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Characters you add will appear on the sheets.
            </p>
          )}
          <SheetPreview
            content={{
              name: values.name,
              authorCredit: values.authorCredit,
              characters,
              nightOrders: nights.orders,
              jinxes: relationships.jinxes,
            }}
            view={preview}
            onViewChange={setPreview}
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
    </fieldset>
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
