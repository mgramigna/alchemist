import {
  REMINDER_COUNT_LIMIT,
  REMINDER_LABEL_LIMIT,
  reminderCountBlocker,
  reminderLabelBlocker,
  type ReminderField,
} from "@alchemist/domain";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { REMINDER_TITLES } from "../lib/fields.ts";
import { Counter } from "./counter.tsx";
import { Button } from "./ui/button.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";

/** Ordered draft labels. Positions identify rows so duplicate labels stay independent. */
export function ReminderTokenList({
  field,
  value,
  onChange,
}: {
  readonly field: ReminderField;
  readonly value: ReadonlyArray<string>;
  readonly onChange: (value: ReadonlyArray<string>) => void;
}) {
  const id = useId();
  const title = REMINDER_TITLES[field];
  const countError = reminderCountBlocker(value);
  const root = useRef<HTMLElement>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useLayoutEffect(() => {
    if (focus === null) return;
    root.current?.querySelector<HTMLElement>(`[data-token-control="${focus}"]`)?.focus();
    setFocus(null);
  }, [focus, value]);

  const move = (index: number, destination: number, direction: "up" | "down") => {
    const next = [...value];
    const label = next.splice(index, 1)[0];

    if (label === undefined) return;
    next.splice(destination, 0, label);
    onChange(next);
    // At a boundary the move button becomes disabled; focus the moved label instead.
    setFocus(
      destination === 0 || destination === value.length - 1
        ? `label-${destination}`
        : `${direction}-${destination}`,
    );
    setAnnouncement(`${title}: token ${index + 1} moved to position ${destination + 1}.`);
  };

  return (
    <section
      ref={root}
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3 border-t pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="font-medium">
          {title}
        </h3>
        <Button
          variant="outline"
          size="sm"
          data-token-control="add"
          aria-label={`Add ${field === "reminders" ? "Reminder Token" : "Global Reminder Token"}`}
          disabled={value.length >= 100}
          onClick={() => {
            onChange([...value, ""]);
            setFocus(`label-${value.length}`);
            setAnnouncement(`${title}: token added at position ${value.length + 1}.`);
          }}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {field === "reminders"
          ? "Available while this Character is in play."
          : "Available even when this Character is not in play."}{" "}
        Duplicate labels are allowed.
      </p>
      <p className="text-xs text-muted-foreground">
        {value.length}/{REMINDER_COUNT_LIMIT} tokens · {REMINDER_LABEL_LIMIT[field]} characters per
        label
      </p>
      {countError && <FieldError>{countError}</FieldError>}
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
      ) : (
        <ol aria-label={title} className="flex min-w-0 flex-col gap-3">
          {value.map((label, index) => {
            const error = reminderLabelBlocker(label, field);
            const inputId = `${id}-${index}`;

            return (
              <li key={index} className="flex min-w-0 items-start gap-2">
                <Field data-invalid={error !== undefined} className="min-w-0 flex-1 gap-1.5">
                  <FieldLabel htmlFor={inputId} className="text-xs text-muted-foreground">
                    Token {index + 1}
                  </FieldLabel>
                  <Input
                    id={inputId}
                    data-token-control={`label-${index}`}
                    value={label}
                    maxLength={100}
                    aria-invalid={error !== undefined}
                    aria-describedby={`${inputId}-count${error ? ` ${inputId}-error` : ""}`}
                    onChange={(event) =>
                      onChange(
                        value.map((current, i) => (i === index ? event.target.value : current)),
                      )
                    }
                  />
                  <FieldDescription id={`${inputId}-count`} className="text-xs">
                    <Counter value={label} limit={REMINDER_LABEL_LIMIT[field]} />
                  </FieldDescription>
                  {error && <FieldError id={`${inputId}-error`}>{error}</FieldError>}
                </Field>
                <div className="flex shrink-0 items-center gap-0.5 pt-6">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move token ${index + 1} up`}
                    data-token-control={`up-${index}`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1, "up")}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move token ${index + 1} down`}
                    data-token-control={`down-${index}`}
                    disabled={index === value.length - 1}
                    onClick={() => move(index, index + 1, "down")}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove token ${index + 1}`}
                    onClick={() => {
                      onChange(value.filter((_, i) => i !== index));
                      setFocus(
                        value.length === 1 ? "add" : `label-${Math.min(index, value.length - 2)}`,
                      );
                      setAnnouncement(`${title}: token ${index + 1} removed.`);
                    }}
                  >
                    <XIcon />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
