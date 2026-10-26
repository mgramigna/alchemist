import {
  JINX_EXPLANATION_EXPORT_LIMIT,
  explanationBlocker,
  jinxKey,
  type Character,
  type CharacterId,
  type Jinx,
  type JinxPair,
  type PublicCharacter,
} from "@alchemist/domain";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useAppForm } from "../hooks/form.ts";
import { characterTitle } from "../lib/characters.ts";
import { CharacterToken } from "./character-token.tsx";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Spinner } from "./ui/spinner.tsx";

function PairNames({
  jinx,
  characters,
}: {
  readonly jinx: JinxPair;
  readonly characters: ReadonlyArray<PublicCharacter>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {[jinx.first, jinx.second].map((id) => {
        const character = characters.find((candidate) => candidate.id === id);

        return (
          character && (
            <span key={id} className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
              <CharacterToken team={character.team} className="size-6" />
              <span className="wrap-anywhere">{characterTitle(character)}</span>
            </span>
          )
        );
      })}
    </div>
  );
}

/** Shared by both endpoint editors; the parent owns the one working copy. */
export function JinxEditor({
  characterId,
  characters,
  jinxes,
  onAdd,
  onChange,
  onDelete,
}: {
  readonly characterId: CharacterId;
  readonly characters: ReadonlyArray<Character>;
  readonly jinxes: ReadonlyArray<Jinx>;
  readonly onAdd: (pair: JinxPair) => Promise<string | undefined>;
  readonly onChange: (pair: JinxPair, explanation: string) => void;
  readonly onDelete: (pair: JinxPair) => Promise<boolean>;
}) {
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [addedKey, setAddedKey] = useState<string>();
  const [error, setError] = useState<string>();

  const attached = jinxes.filter(
    (jinx) => jinx.first === characterId || jinx.second === characterId,
  );

  const available = characters.filter(
    (character) =>
      character.id !== characterId &&
      !attached.some((jinx) => jinx.first === character.id || jinx.second === character.id),
  );

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="font-medium">
          Jinxes
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending || available.length === 0}
            render={<Button variant="outline" size="sm" />}
          >
            {pending ? <Spinner /> : <PlusIcon />}Add Jinx
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              {available.map((character) => (
                <DropdownMenuItem
                  key={character.id}
                  onClick={async () => {
                    setPending(true);
                    setError(undefined);
                    const message = await onAdd({ first: characterId, second: character.id });

                    if (message === undefined)
                      setAddedKey(jinxKey({ first: characterId, second: character.id }));
                    setError(message);
                    setPending(false);
                  }}
                >
                  <CharacterToken team={character.team} className="size-5" />
                  <span className="min-w-0 truncate">{characterTitle(character)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-sm text-muted-foreground">
        Explain how two Characters interact. Changes are shared with the other Character.
      </p>
      {attached.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Jinxes yet.{" "}
          {characters.length < 2
            ? "Add another Character to this Script to create one."
            : "Choose a Character with Add Jinx."}
        </p>
      )}
      {available.length === 0 && attached.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Every other Character already has a Jinx with this one.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {attached.map((jinx) => (
        <JinxFields
          key={jinxKey(jinx)}
          autoFocus={addedKey === jinxKey(jinx)}
          jinx={jinx}
          characters={characters}
          onChange={(explanation) => onChange(jinx, explanation)}
          onDelete={async () => {
            setError(undefined);

            if (!(await onDelete(jinx))) setError("Couldn’t delete the Jinx. Try again.");
          }}
        />
      ))}
    </section>
  );
}

function JinxFields({
  autoFocus,
  jinx,
  characters,
  onChange,
  onDelete,
}: {
  readonly autoFocus: boolean;
  readonly jinx: Jinx;
  readonly characters: ReadonlyArray<Character>;
  readonly onChange: (explanation: string) => void;
  readonly onDelete: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  const form = useAppForm({
    defaultValues: { explanation: jinx.explanation },
    listeners: { onChange: ({ formApi }) => onChange(formApi.state.values.explanation) },
  });

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PairNames jinx={jinx} characters={characters} />
        <Button
          variant="ghost"
          size="xs"
          disabled={pending}
          aria-label={`Delete Jinx between ${characters
            .flatMap((c) =>
              c.id === jinx.first || c.id === jinx.second ? [characterTitle(c)] : [],
            )
            .join(" and ")}`}
          onClick={async () => {
            setPending(true);
            await onDelete();
            setPending(false);
          }}
        >
          {pending ? <Spinner /> : <TrashIcon />}Delete Jinx
        </Button>
      </div>
      <form.AppForm>
        <form.AppField
          name="explanation"
          defaultMeta={{ isTouched: true }}
          validators={{
            onMount: ({ value }) => explanationBlocker(value),
            onChange: ({ value }) => explanationBlocker(value),
          }}
        >
          {(field) => (
            <field.TextareaField
              className="max-h-64 overflow-y-auto"
              label="Jinx explanation"
              autoFocus={autoFocus}
              description={`${field.state.value.length}/${JINX_EXPLANATION_EXPORT_LIMIT} characters · Drafts save even when invalid.`}
              maxLength={2000}
              rows={3}
            />
          )}
        </form.AppField>
      </form.AppForm>
    </div>
  );
}

export function JinxPreview({
  jinxes,
  characters,
}: {
  readonly jinxes: ReadonlyArray<Jinx>;
  readonly characters: ReadonlyArray<PublicCharacter>;
}) {
  const id = useId();

  if (jinxes.length === 0) return null;

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t p-4">
      <h3 id={id} className="font-heading text-sm tracking-wide uppercase">
        Jinxes
      </h3>
      <ul className="flex flex-col gap-4">
        {jinxes.map((jinx) => (
          <li key={jinxKey(jinx)} className="flex min-w-0 flex-col gap-1.5">
            <PairNames jinx={jinx} characters={characters} />
            <p className="text-sm whitespace-pre-wrap wrap-anywhere">
              {jinx.explanation.trim() || "Add an explanation for this Jinx."}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
