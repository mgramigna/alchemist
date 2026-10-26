import {
  ABILITY_EXPORT_LIMIT,
  AuthoredTeam,
  INSTRUCTIONS_EXPORT_LIMIT,
  NAME_EXPORT_LIMIT,
  NIGHTS,
  abilityBlocker,
  instructionsBlocker,
  defaultAlignment,
  genericIcons,
  nameBlocker,
  type Alignment,
  type Character,
  type CharacterDetails,
  type CharacterId,
  type ExportBlocker,
  type IconVariant,
  type Night,
  type NightOrders,
  type PublicCharacter,
} from "@alchemist/domain";
import { ArrowRightIcon, PlusIcon, ScrollIcon, TrashIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { cn } from "cn";
import { useAppForm } from "../hooks/form.ts";
import {
  ICON_VARIANT_LABELS,
  characterTitle,
  groupByTeam,
  teamLabel,
  teamPluralLabel,
} from "../lib/characters.ts";
import { INSTRUCTIONS_FIELD, NIGHT_LABELS, positionSummary } from "../lib/night.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Field, FieldLabel } from "./ui/field.tsx";
import { Spinner } from "./ui/spinner.tsx";

// Creation asks which nights a new Character acts on; some act on neither.
const NIGHT_CHOICES: ReadonlyArray<{
  readonly label: string;
  readonly nights: ReadonlyArray<Night>;
}> = [
  { label: "First Night and Other Nights", nights: ["firstNight", "otherNight"] },
  { label: "First Night only", nights: ["firstNight"] },
  { label: "Other Nights only", nights: ["otherNight"] },
  { label: "No night action", nights: [] },
];

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
  readonly onAdd: (team: AuthoredTeam, nights: ReadonlyArray<Night>) => void;
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
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={adding !== null}
            render={<Button variant="ghost" size="xs" aria-label={`Add ${teamLabel(team)}`} />}
          >
            {adding === team ? <Spinner /> : <PlusIcon />}
            Add
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>When does this {teamLabel(team)} act?</DropdownMenuLabel>
              {NIGHT_CHOICES.map(({ label, nights }) => (
                <DropdownMenuItem key={label} onClick={() => onAdd(team, nights)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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

/**
 * Name, Team, ability and night actions for one Character. Edits flow out as
 * they are typed; night membership changes the Script's Night Orders.
 */
export function CharacterForm({
  character,
  characters,
  nightOrders,
  autoFocusName,
  onChange,
  onDelete,
  onToggleNight,
  onOpenNight,
}: {
  readonly character: Character;
  readonly characters: ReadonlyArray<Character>;
  readonly nightOrders: NightOrders;
  readonly autoFocusName: boolean;
  readonly onChange: (details: CharacterDetails) => void;
  readonly onDelete: () => void;
  readonly onToggleNight: (night: Night, member: boolean) => void;
  readonly onOpenNight: (night: Night) => void;
}) {
  const otherNames = characters.flatMap(({ id, name }) => (id === character.id ? [] : [name]));

  const form = useAppForm({
    defaultValues: {
      name: character.name,
      ability: character.ability,
      team: character.team,
      firstNightInstructions: character.firstNightInstructions,
      otherNightInstructions: character.otherNightInstructions,
    },
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
        <section aria-labelledby="nights-title" className="flex flex-col gap-5 border-t pt-5">
          <div className="flex flex-col gap-1">
            <h3 id="nights-title" className="font-medium">
              Night actions
            </h3>
            <p className="text-sm text-muted-foreground">
              Membership decides who acts. Instructions are kept even when the Character leaves a
              night.
            </p>
          </div>
          {NIGHTS.map((night) => (
            <div key={night} className="flex flex-col gap-3">
              <NightMembership
                night={night}
                summary={positionSummary(nightOrders[night], character.id, characters)}
                onToggle={(member) => onToggleNight(night, member)}
                onOpen={() => onOpenNight(night)}
              />
              <form.AppField
                name={INSTRUCTIONS_FIELD[night]}
                validators={{ onChange: ({ value }) => instructionsBlocker(value) }}
              >
                {(field) => (
                  <field.TextareaField
                    label={`${NIGHT_LABELS[night]} instructions`}
                    description={
                      <span className="flex flex-col gap-0.5">
                        {field.state.value.trim() === "" && (
                          <span className="text-nudge">
                            Tell the Storyteller what to do. Blank instructions still keep the
                            Character in the night.
                          </span>
                        )}
                        <Counter value={field.state.value} limit={INSTRUCTIONS_EXPORT_LIMIT} />
                      </span>
                    }
                    maxLength={2000}
                    rows={2}
                  />
                )}
              </form.AppField>
            </div>
          ))}
        </section>
      </form.Form>
    </form.AppForm>
  );
}

function NightMembership({
  night,
  summary,
  onToggle,
  onOpen,
}: {
  readonly night: Night;
  readonly summary: string | undefined;
  readonly onToggle: (member: boolean) => void;
  readonly onOpen: () => void;
}) {
  const id = useId();
  const label = NIGHT_LABELS[night];

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <Field orientation="horizontal" className="w-auto">
        <Checkbox id={id} checked={summary !== undefined} onCheckedChange={onToggle} />
        <FieldLabel htmlFor={id} className="font-normal">
          Acts on {night === "firstNight" ? "the First Night" : "Other Nights"}
        </FieldLabel>
      </Field>
      {summary !== undefined && (
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-muted-foreground">{summary}</span>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onOpen}>
            Reorder {label}
            <ArrowRightIcon />
          </Button>
        </div>
      )}
    </div>
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
