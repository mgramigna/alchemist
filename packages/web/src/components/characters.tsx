import {
  ABILITY_EXPORT_LIMIT,
  AuthoredTeam,
  NAME_EXPORT_LIMIT,
  abilityBlocker,
  defaultAlignment,
  genericIcons,
  nameBlocker,
  type Alignment,
  type Character,
  type CharacterDetails,
  type CharacterId,
  type ExportBlocker,
  type IconVariant,
  type PublicCharacter,
} from "@alchemist/domain";
import { PlusIcon, ScrollIcon, TrashIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useAppForm } from "../hooks/form.ts";
import {
  ICON_VARIANT_LABELS,
  characterTitle,
  groupByTeam,
  teamLabel,
  teamPluralLabel,
} from "../lib/characters.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Spinner } from "./ui/spinner.tsx";

/** A generic icon. Decorative by default: the Character's name labels it. */
export function CharacterToken({
  team,
  variant,
  className,
}: {
  readonly team: AuthoredTeam;
  readonly variant?: IconVariant;
  readonly className?: string;
}) {
  const icons = genericIcons(team);
  const icon = icons.find((candidate) => candidate.variant === variant) ?? icons[0];

  return (
    <img
      src={icon?.path}
      alt=""
      width={400}
      height={400}
      className={cn("size-8 shrink-0", className)}
    />
  );
}

const rowClass =
  "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** Characters grouped by Team, each with its export blocker count. */
export function CharacterNavigator({
  characters,
  blockers,
  selectedId,
  adding,
  onSelect,
  onAdd,
}: {
  readonly characters: ReadonlyArray<Character>;
  readonly blockers: ReadonlyArray<ExportBlocker>;
  readonly selectedId: CharacterId | null;
  readonly adding: AuthoredTeam | null;
  readonly onSelect: (id: CharacterId) => void;
  readonly onAdd: (team: AuthoredTeam) => void;
}) {
  return groupByTeam(characters).map(({ team, characters: members }) => (
    <section key={team} aria-labelledby={`team-${team}`} className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 pr-1 pl-3">
        <h2
          id={`team-${team}`}
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {teamPluralLabel(team)}
        </h2>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Add ${teamLabel(team)}`}
          disabled={adding !== null}
          onClick={() => onAdd(team)}
        >
          {adding === team ? <Spinner /> : <PlusIcon />}
          Add
        </Button>
      </div>
      {members.length > 0 && (
        <ul aria-label={teamPluralLabel(team)} className="flex flex-col gap-0.5">
          {members.map((character) => {
            const count = blockers.filter(({ characterId }) => characterId === character.id).length;

            return (
              <li key={character.id}>
                <button
                  type="button"
                  aria-current={character.id === selectedId ? "true" : undefined}
                  onClick={() => onSelect(character.id)}
                  className={cn(rowClass, character.id === selectedId && "bg-muted font-medium")}
                >
                  <CharacterToken team={character.team} className="size-5" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      character.name.trim() === "" && "text-muted-foreground",
                    )}
                  >
                    {characterTitle(character)}
                  </span>
                  {count > 0 && (
                    <Badge variant="destructive">
                      <span aria-hidden="true">{count}</span>
                      <span className="sr-only">
                        {count === 1 ? "1 problem" : `${count} problems`}
                      </span>
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  ));
}

/** Everything that blocks export across the Script. Each entry opens its Character. */
export function ExportBlockerList({
  characters,
  blockers,
  onSelect,
}: {
  readonly characters: ReadonlyArray<Character>;
  readonly blockers: ReadonlyArray<ExportBlocker>;
  readonly onSelect: (id: CharacterId) => void;
}) {
  return (
    <section aria-labelledby="blockers-title" className="flex flex-col gap-2 border-t pt-5">
      <h3 id="blockers-title" className="font-medium">
        Before you can export
      </h3>
      {blockers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing blocks export.</p>
      ) : (
        <ul className="-mx-3 flex flex-col">
          {blockers.map((blocker) => {
            const character = characters.find(({ id }) => id === blocker.characterId);

            return (
              <li key={`${blocker.characterId}-${blocker.field}`}>
                <button
                  type="button"
                  onClick={() => onSelect(blocker.characterId)}
                  className={cn(rowClass, "text-sm")}
                >
                  {character && <CharacterToken team={character.team} className="size-5" />}
                  <span className="min-w-0">
                    <span className="font-medium">
                      {character ? characterTitle(character) : "Character"}:
                    </span>{" "}
                    <span className="text-destructive">{blocker.message}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Export limits are not enforced while typing, so drafts can run over them.
function Counter({ value, limit }: { readonly value: string; readonly limit: number }) {
  return (
    <span className={cn("tabular-nums", value.length > limit && "text-destructive")}>
      {value.length}/{limit} characters
    </span>
  );
}

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:*:bg-popover";

/** Name, Team and ability for one Character. Edits flow out as they are typed. */
export function CharacterForm({
  character,
  otherNames,
  autoFocusName,
  onChange,
  onDelete,
}: {
  readonly character: Character;
  readonly otherNames: ReadonlyArray<string>;
  readonly autoFocusName: boolean;
  readonly onChange: (details: CharacterDetails) => void;
  readonly onDelete: () => void;
}) {
  const form = useAppForm({
    defaultValues: { name: character.name, ability: character.ability, team: character.team },
    listeners: {
      onChange: ({ formApi }) => onChange(formApi.state.values),
    },
  });

  return (
    <form.AppForm>
      <form.Form
        aria-labelledby="character-title"
        className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-5 lg:col-span-5"
      >
        <div className="flex items-center gap-3">
          <CharacterToken team={character.team} className="size-11" />
          <h2 id="character-title" className="min-w-0 flex-1 text-xl font-semibold wrap-anywhere">
            {characterTitle(character)}
          </h2>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            <TrashIcon />
            Delete Character
          </Button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <form.AppField
            name="name"
            validators={{ onChange: ({ value }) => nameBlocker(value, otherNames) }}
          >
            {(field) => (
              <field.TextField
                label="Name"
                description={<Counter value={field.state.value} limit={NAME_EXPORT_LIMIT} />}
                maxLength={100}
                autoComplete="off"
                autoFocus={autoFocusName}
              />
            )}
          </form.AppField>
          <form.AppField name="team">
            {(field) => (
              <field.Control label="Team">
                {(control) => (
                  <select
                    {...control}
                    className={selectClass}
                    value={field.state.value}
                    onChange={(event) => {
                      const team = AuthoredTeam.literals.find(
                        (candidate) => candidate === event.target.value,
                      );

                      if (team) field.handleChange(team);
                    }}
                  >
                    {AuthoredTeam.literals.map((team) => (
                      <option key={team} value={team}>
                        {teamLabel(team)}
                      </option>
                    ))}
                  </select>
                )}
              </field.Control>
            )}
          </form.AppField>
        </div>
        <form.AppField
          name="ability"
          validators={{ onChange: ({ value }) => abilityBlocker(value) }}
        >
          {(field) => (
            <field.TextareaField
              label="Ability"
              description={<Counter value={field.state.value} limit={ABILITY_EXPORT_LIMIT} />}
              maxLength={1000}
              rows={3}
            />
          )}
        </form.AppField>
        <section aria-labelledby="icon-title" className="flex flex-col gap-2 border-t pt-5">
          <h3 id="icon-title" className="font-medium">
            Icon
          </h3>
          <p className="text-sm text-muted-foreground">
            Generic icons follow the Team until you add artwork.
          </p>
          <ul className="flex flex-wrap gap-4">
            {genericIcons(character.team).map(({ variant }) => (
              <li key={variant} className="flex flex-col items-center gap-1 text-xs">
                <CharacterToken team={character.team} variant={variant} className="size-12" />
                {ICON_VARIANT_LABELS[variant]}
              </li>
            ))}
          </ul>
        </section>
      </form.Form>
    </form.AppForm>
  );
}

// Team colour rails from the sheet layout prototype.
const RAILS: Record<Alignment | "unaligned", string> = {
  good: "border-good",
  evil: "border-evil",
  unaligned: "border-nudge",
};

const railClass = (team: AuthoredTeam) => RAILS[defaultAlignment(team) ?? "unaligned"];

/**
 * Minimal live Character sheet: the title band and Characters by Team. Pass
 * `onSelect` to make each Character a button.
 */
export function SheetPreview({
  name,
  authorCredit,
  characters,
  selectedId = null,
  onSelect,
}: {
  readonly name: string;
  readonly authorCredit: string;
  readonly characters: ReadonlyArray<PublicCharacter>;
  readonly selectedId?: CharacterId | null;
  readonly onSelect?: (id: CharacterId) => void;
}) {
  const groups = groupByTeam(characters).filter(({ characters: members }) => members.length > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col items-center gap-1 bg-band px-4 py-5 text-center text-band-foreground">
        <p className="font-heading text-xl wrap-anywhere">{name.trim() || "Untitled Script"}</p>
        <p className="text-xs wrap-anywhere opacity-80">
          {authorCredit.trim() ? `by ${authorCredit}` : "Uncredited"}
        </p>
      </div>
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
          <ScrollIcon className="size-6" />
          <p>Characters you add will appear on this sheet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {groups.map(({ team, characters: members }) => (
            <section
              key={team}
              aria-labelledby={`sheet-${team}`}
              className={cn("flex flex-col gap-1 border-l-4 pl-2", railClass(team))}
            >
              <h3
                id={`sheet-${team}`}
                className="px-2 font-heading text-sm tracking-wide uppercase"
              >
                {teamPluralLabel(team)}
              </h3>
              <ul className="flex flex-col">
                {members.map((character) => (
                  <li key={character.id}>
                    <SheetRow
                      character={character}
                      selected={character.id === selectedId}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SheetRow({
  character,
  selected,
  onSelect,
}: {
  readonly character: PublicCharacter;
  readonly selected: boolean;
  readonly onSelect: ((id: CharacterId) => void) | undefined;
}) {
  const content = (
    <>
      <CharacterToken team={character.team} className="size-9" />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium wrap-anywhere">{characterTitle(character)}</span>
        <span className="text-xs wrap-anywhere text-muted-foreground">
          {character.ability.trim() || <em>No ability yet</em>}
        </span>
      </span>
    </>
  );

  if (onSelect === undefined)
    return <div className="flex items-start gap-2 px-2 py-1.5">{content}</div>;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(character.id)}
      className={cn(rowClass, "items-start px-2", selected && "bg-muted")}
    >
      {content}
    </button>
  );
}
