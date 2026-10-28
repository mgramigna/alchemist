import {
  SCRIPT_ARTWORK_FIELDS,
  SOURCE_TYPES,
  sourceProblem,
  type ScriptArtwork,
  type ScriptArtworkField,
  type ScriptId,
} from "@alchemist/domain";
import { useAtomSet } from "@effect/atom-react";
import { ImageBrokenIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Cause, Exit, Predicate, Result } from "effect";
import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "cn";
import { removeScriptArtwork, uploadScriptArtwork } from "../api.ts";
import { Button } from "./ui/button.tsx";
import { Spinner } from "./ui/spinner.tsx";

const SLOTS: Record<
  ScriptArtworkField,
  { readonly label: string; readonly noun: string; readonly description: string }
> = {
  logo: {
    label: "Logo",
    noun: "logo",
    description: "The Script’s logo in exported JSON.",
  },
  background: {
    label: "Background",
    noun: "background",
    description: "The Script’s background image in exported JSON.",
  },
};

type Job =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly label: string }
  | { readonly kind: "failed"; readonly message: string; readonly retry: () => void };

const IDLE: Job = { kind: "idle" };

const failureMessage = (exit: Exit.Exit<unknown, unknown>, fallback: string) => {
  if (Exit.isSuccess(exit)) return fallback;
  const error = Cause.findError(exit.cause);

  if (Result.isFailure(error)) return fallback;

  if (
    Predicate.isTagged(error.success, "ArtworkInvalid") &&
    Predicate.hasProperty(error.success, "message")
  )
    return String(error.success.message);

  if (Predicate.isTagged(error.success, "ArtworkConflict"))
    return "This artwork changed in another tab. Reload to see the latest version.";

  return fallback;
};

/**
 * The Script's logo and background. They are exported in the Script's JSON
 * metadata exactly as uploaded; printed sheets do not use them.
 */
export function ScriptArtworkEditor({
  scriptId,
  artwork,
  onArtwork,
  credit,
}: {
  readonly scriptId: ScriptId;
  readonly artwork: ScriptArtwork;
  readonly onArtwork: (artwork: ScriptArtwork) => void;
  // The slot's image credit field, shown while the slot has an image.
  readonly credit: (field: ScriptArtworkField) => ReactNode;
}) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 border-t pt-5">
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="font-medium">
          Script artwork
        </h3>
        <p className="text-sm text-muted-foreground">
          Included in exported JSON exactly as uploaded, without Character styling. Printed sheets
          don’t use them.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SCRIPT_ARTWORK_FIELDS.map((field) => (
          <ArtworkSlot
            key={field}
            scriptId={scriptId}
            field={field}
            path={artwork[field]}
            onArtwork={onArtwork}
            credit={credit(field)}
          />
        ))}
      </div>
    </section>
  );
}

function ArtworkSlot({
  scriptId,
  field,
  path,
  onArtwork,
  credit,
}: {
  readonly scriptId: ScriptId;
  readonly field: ScriptArtworkField;
  readonly path: string | null;
  readonly onArtwork: (artwork: ScriptArtwork) => void;
  readonly credit: ReactNode;
}) {
  const upload = useAtomSet(uploadScriptArtwork, { mode: "promiseExit" });
  const remove = useAtomSet(removeScriptArtwork, { mode: "promiseExit" });
  const [job, setJob] = useState<Job>(IDLE);
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { label, noun, description } = SLOTS[field];
  const busy = job.kind === "working";

  const fail = (message: string, retry: () => void) => setJob({ kind: "failed", message, retry });

  const publish = async (file: File) => {
    setJob({ kind: "working", label: `Publishing ${noun}…` });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = sourceProblem(bytes);

    if (problem !== undefined) return fail(problem, () => input.current?.click());

    const exit = await upload({
      payload: { id: scriptId, field, source: bytes },
      // An upload replaces any imported reference awaiting repair.
      reactivityKeys: [`Script:imported:${scriptId}`],
    });

    if (Exit.isFailure(exit))
      return fail(
        failureMessage(exit, `Couldn’t save the ${noun}. Your previous ${noun} is unchanged.`),
        () => void publish(file),
      );

    onArtwork(exit.value);
    setJob(IDLE);
  };

  const clear = async () => {
    setJob({ kind: "working", label: `Removing ${noun}…` });
    const exit = await remove({ payload: { id: scriptId, field } });

    if (Exit.isFailure(exit))
      return fail(
        failureMessage(exit, `Couldn’t remove the ${noun}. It’s unchanged; try again.`),
        () => void clear(),
      );

    onArtwork(exit.value);
    setJob(IDLE);
  };

  const choose = (files: FileList | null) => {
    const file = files?.[0];

    if (file !== undefined && !busy) void publish(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  };

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-dashed p-3 transition-colors",
        dragging && "border-ring bg-muted",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h4 id={titleId} className="text-sm font-medium">
          {label}
        </h4>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border checkerboard">
        {path === null ? (
          <span className="px-3 text-center text-sm text-muted-foreground">No {noun}</span>
        ) : broken === path ? (
          <span className="flex items-center gap-2 px-3 text-center text-sm text-destructive">
            <ImageBrokenIcon aria-hidden="true" />
            Couldn’t load the {noun} preview.
          </span>
        ) : (
          <img
            src={path}
            alt={`Current ${noun}`}
            className="size-full object-contain"
            onError={() => setBroken(path)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={SOURCE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            choose(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={`${path === null ? "Upload" : "Replace"} ${noun}`}
          onClick={() => input.current?.click()}
        >
          <UploadSimpleIcon />
          {path === null ? "Upload" : "Replace"}
        </Button>
        {path !== null && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Remove ${noun}`}
            onClick={() => void clear()}
          >
            <TrashIcon />
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        PNG, JPEG, WebP or GIF up to 10 MB. You can also drop an image here.
      </p>
      {path !== null && credit}
      {job.kind === "working" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" role={undefined} />
          {job.label}
        </p>
      )}
      {job.kind === "failed" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          {job.message}
          <Button variant="outline" size="sm" onClick={job.retry}>
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}
