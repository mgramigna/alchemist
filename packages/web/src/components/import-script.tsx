import { useAtom } from "@effect/atom-react";
import { ImportJson, ScriptImportInvalid, type ImportReview } from "@alchemist/domain";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { Cause, Exit, Result, Schema } from "effect";
import { useId, useState } from "react";
import { importScript, reviewScriptImport, ScriptKeys } from "../api.ts";
import { useAppForm } from "../hooks/form.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Field, FieldDescription, FieldLabel } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { Textarea } from "./ui/textarea.tsx";

export function ImportScriptButton() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>
        <UploadSimpleIcon />
        Import JSON
      </SheetTrigger>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Import a Script</SheetTitle>
          <SheetDescription>
            Bring your Custom Characters into a new, editable Script.
          </SheetDescription>
        </SheetHeader>
        {open && <ImportScriptForm onDone={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function ImportScriptForm({ onDone }: { readonly onDone: () => void }) {
  const navigate = useNavigate();
  const [reviewing, review] = useAtom(reviewScriptImport, { mode: "promiseExit" });
  const [importing, commit] = useAtom(importScript, { mode: "promiseExit" });

  const [reviewed, setReviewed] = useState<{
    readonly json: string;
    readonly report: ImportReview;
  } | null>(null);

  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileId = useId();
  const acknowledgementId = useId();
  const busy = reviewing.waiting || importing.waiting || reading;

  const form = useAppForm({
    defaultValues: { json: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      const exit = await review({ payload: { json: value.json } });

      if (Exit.isSuccess(exit)) {
        setReviewed({ json: value.json, report: exit.value });
        setAcknowledged(false);
      } else
        setError(
          "Could not review this JSON. Check your connection and sign-in, then try again. Your input is kept here.",
        );
    },
  });

  const report = reviewed?.report;

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      {reviewed === null ? (
        <form.AppForm>
          <form.Form className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor={fileId}>Choose a JSON file</FieldLabel>
              <Input
                id={fileId}
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];

                  if (file === undefined) return;

                  if (file.size > 2_000_000) {
                    setError("Choose a JSON file smaller than 2 MB.");

                    return;
                  }

                  setReading(true);
                  setError(null);

                  try {
                    form.setFieldValue("json", await file.text());
                  } catch {
                    setError("Could not read this file. Choose it again or paste the JSON below.");
                  } finally {
                    setReading(false);
                  }
                }}
              />
              <FieldDescription>
                Custom Characters only. Official Characters, Fabled, and Loric are unsupported.
              </FieldDescription>
            </Field>
            <form.AppField
              name="json"
              validators={{ onChange: Schema.toStandardSchemaV1(ImportJson) }}
            >
              {(field) => (
                <field.TextareaField
                  label="Or paste JSON"
                  description="Review the contents before anything is saved."
                  rows={12}
                  spellCheck={false}
                  className="font-mono"
                  disabled={busy}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.json}>
              {(json) => (
                <form.SubmitButton disabled={busy || !json.trim()} pendingLabel="Reviewing…">
                  Review import
                </form.SubmitButton>
              )}
            </form.Subscribe>
          </form.Form>
        </form.AppForm>
      ) : (
        <div className="flex flex-col gap-5" aria-live="polite">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Import review
            </p>
            <h2 className="text-xl font-semibold wrap-anywhere">
              {report?.draft?.script.name || "This JSON needs attention"}
            </h2>
            {report?.draft && (
              <>
                <p className="text-sm text-muted-foreground wrap-anywhere">
                  Author Credit: {report.draft.script.authorCredit || "Uncredited"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {report.draft.characters.length}{" "}
                    {report.draft.characters.length === 1 ? "Character" : "Characters"}
                  </Badge>
                  <Badge variant="secondary">
                    {report.draft.jinxes.length}{" "}
                    {report.draft.jinxes.length === 1 ? "Jinx" : "Jinxes"}
                  </Badge>
                </div>
              </>
            )}
          </div>
          {report && (
            <>
              <ImportMessages title="Cannot import yet" messages={report.errors} destructive />
              <ImportMessages title="Artwork and defaults" messages={report.warnings} />
              <ImportMessages
                title={`${report.blockers.length} export blockers`}
                messages={report.blockers.map(
                  (problem) =>
                    `${problem.characterId ?? "Script"} · ${problem.field}: ${problem.message}`,
                )}
              />
              {report.blockers.length > 0 && report.draft && (
                <p className="text-sm text-muted-foreground">
                  You can import this draft and correct these problems in the Workbench before
                  exporting.
                </p>
              )}
              <ImportMessages title="Unsupported fields to discard" messages={report.discarded} />
              {report.discarded.length > 0 && report.draft && (
                <Field orientation="horizontal">
                  <Checkbox
                    id={acknowledgementId}
                    checked={acknowledged}
                    onCheckedChange={setAcknowledged}
                    disabled={busy}
                  />
                  <FieldLabel htmlFor={acknowledgementId}>
                    I understand that the listed unsupported fields will be discarded.
                  </FieldLabel>
                </Field>
              )}
            </>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Original JSON</summary>
            <Textarea
              aria-label="Original JSON"
              value={reviewed.json}
              readOnly
              rows={8}
              className="mt-3 font-mono"
            />
          </details>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReviewed(null);
                setError(null);
              }}
            >
              Back to JSON
            </Button>
            <Button
              disabled={
                busy || report?.draft == null || (report.discarded.length > 0 && !acknowledged)
              }
              onClick={async () => {
                setError(null);

                const exit = await commit({
                  payload: { json: reviewed.json, acknowledgeDiscard: acknowledged },
                  reactivityKeys: [ScriptKeys.owned],
                });

                if (Exit.isSuccess(exit)) {
                  onDone();
                  await navigate({
                    to: "/scripts/$scriptId/edit",
                    params: { scriptId: exit.value.id },
                  });
                } else {
                  const reason = Cause.findError(exit.cause);

                  setError(
                    Result.isSuccess(reason) && Schema.is(ScriptImportInvalid)(reason.success)
                      ? reason.success.messages.join(" ")
                      : "Could not import this Script. Check your connection and sign-in, then try again. Your JSON is kept here.",
                  );
                }
              }}
            >
              {importing.waiting && <Spinner />}
              {importing.waiting ? "Importing…" : "Import Script"}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ImportMessages({
  title,
  messages,
  destructive = false,
}: {
  readonly title: string;
  readonly messages: ReadonlyArray<string>;
  readonly destructive?: boolean;
}) {
  if (!messages.length) return null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
      <h3 className={destructive ? "text-sm font-medium text-destructive" : "text-sm font-medium"}>
        {title}
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground wrap-anywhere">
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    </section>
  );
}
