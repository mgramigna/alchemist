import {
  addBeforeDawn,
  isNightStep,
  moveEntry,
  removeEntry,
  type Character,
  type CharacterId,
  type Night,
  type NightEntry,
  type NightOrder,
  type NightStep,
} from "@alchemist/domain";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsSixVerticalIcon,
  MoonIcon,
  PlusIcon,
  SunHorizonIcon,
  UsersThreeIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { characterTitle } from "../lib/characters.ts";
import { INSTRUCTIONS_FIELD, NIGHT_LABELS, STEP_DESCRIPTIONS, entryTitle } from "../lib/night.ts";
import { CharacterToken } from "./characters.tsx";
import { Button } from "./ui/button.tsx";

const STEP_ICONS: Record<NightStep, Icon> = {
  dusk: MoonIcon,
  minioninfo: UsersThreeIcon,
  demoninfo: UsersThreeIcon,
  dawn: SunHorizonIcon,
};

function EntryIcon({
  entry,
  character,
  className,
}: {
  readonly entry: NightEntry;
  readonly character: Character | undefined;
  readonly className: string;
}) {
  if (isNightStep(entry)) {
    const StepIcon = STEP_ICONS[entry];

    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
          className,
        )}
      >
        <StepIcon className="size-1/2" aria-hidden="true" />
      </span>
    );
  }

  return character ? <CharacterToken character={character} className={className} /> : null;
}

/** The entry's Night Instructions, or a prompt to write them. Blank entries stay in the order. */
function EntryInstructions({
  night,
  entry,
  character,
}: {
  readonly night: Night;
  readonly entry: NightEntry;
  readonly character: Character | undefined;
}) {
  if (isNightStep(entry))
    return <span className="text-muted-foreground">{STEP_DESCRIPTIONS[entry]}</span>;

  const instructions = character?.[INSTRUCTIONS_FIELD[night]].trim() ?? "";

  return instructions === "" ? (
    <em className="text-nudge">Add instructions for the Storyteller.</em>
  ) : (
    <span className="text-muted-foreground">{instructions}</span>
  );
}

type Direction = "up" | "down";

/**
 * One night's complete order. Entries move by dragging or with their move
 * buttons; Characters not in the night wait in a tray and join before Dawn.
 */
export function NightOrderEditor({
  night,
  order,
  characters,
  onChange,
  onSelect,
}: {
  readonly night: Night;
  readonly order: NightOrder;
  readonly characters: ReadonlyArray<Character>;
  readonly onChange: (order: NightOrder) => void;
  readonly onSelect: (id: CharacterId) => void;
}) {
  const label = NIGHT_LABELS[night];
  const [announcement, setAnnouncement] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Moving a row re-inserts its DOM node, which drops focus; restore it afterwards.
  const [focusAfterMove, setFocusAfterMove] = useState<{
    readonly entry: NightEntry;
    readonly direction: Direction;
  } | null>(null);

  const find = (entry: NightEntry) => characters.find(({ id }) => id === entry);
  const title = (entry: NightEntry) => entryTitle(entry, characters);
  const absent = characters.filter(({ id }) => !order.includes(id));

  useEffect(() => {
    if (focusAfterMove === null) return;

    const { entry, direction } = focusAfterMove;
    const index = order.indexOf(entry);
    // At either end the pressed button disables, so focus its partner instead.
    const atEnd = direction === "up" ? index === 0 : index === order.length - 1;
    const target = atEnd ? (direction === "up" ? "down" : "up") : direction;

    buttons.current.get(`${entry}:${target}`)?.focus();
    setFocusAfterMove(null);
  }, [focusAfterMove, order]);

  const move = (from: number, to: number) => {
    const entry = order[from];
    const next = moveEntry(order, from, to);

    if (entry === undefined || next === order) return;

    onChange(next);
    setAnnouncement(`${title(entry)} moved to position ${to + 1} of ${order.length}.`);
  };

  const ref = (key: string) => (element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(key, element);
    else buttons.current.delete(key);
  };

  return (
    <section
      aria-labelledby="night-title"
      className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-5 lg:col-span-5 lg:self-start"
    >
      <div className="flex flex-col gap-1">
        <h2 id="night-title" className="text-xl font-semibold">
          {label}
        </h2>
        <p className="text-sm text-muted-foreground">
          Drag entries, or use their arrow buttons, to set the order. Standard steps move too, and
          Characters can act after Dawn.
        </p>
      </div>
      <ol aria-label={`${label} order`} className="-mx-2 flex flex-col">
        {order.map((entry, index) => {
          const character = find(entry);
          const name = title(entry);

          return (
            <li
              key={entry}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", name);
                setDragFrom(index);
              }}
              onDragOver={(event) => {
                if (dragFrom === null) return;
                event.preventDefault();
                setDropAt(index);
              }}
              onDrop={(event) => {
                event.preventDefault();

                if (dragFrom !== null) move(dragFrom, index);
                setDragFrom(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
              className={cn(
                "flex items-start gap-2 rounded-lg border-y-2 border-transparent px-2 py-2",
                dragFrom === index && "opacity-50",
                dropAt === index &&
                  dragFrom !== null &&
                  dragFrom !== index &&
                  (dragFrom < index ? "border-b-primary" : "border-t-primary"),
              )}
            >
              <DotsSixVerticalIcon
                aria-hidden="true"
                className="mt-2 hidden size-4 shrink-0 cursor-grab text-muted-foreground sm:block"
              />
              <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <EntryIcon entry={entry} character={character} className="size-8" />
              <div className="flex min-w-0 flex-1 flex-col text-sm">
                {character ? (
                  <button
                    type="button"
                    onClick={() => onSelect(character.id)}
                    className="w-fit text-left font-medium wrap-anywhere hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {name}
                  </button>
                ) : (
                  <span className="font-medium">{name}</span>
                )}
                <span className="line-clamp-2 text-xs wrap-anywhere">
                  <EntryInstructions night={night} entry={entry} character={character} />
                </span>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  ref={ref(`${entry}:up`)}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} up`}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, index - 1);
                    setFocusAfterMove({ entry, direction: "up" });
                  }}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  ref={ref(`${entry}:down`)}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} down`}
                  disabled={index === order.length - 1}
                  onClick={() => {
                    move(index, index + 1);
                    setFocusAfterMove({ entry, direction: "down" });
                  }}
                >
                  <ArrowDownIcon />
                </Button>
                {character ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${name} from ${label}`}
                    onClick={() => {
                      onChange(removeEntry(order, entry));
                      setAnnouncement(`${name} removed from ${label}. Its instructions are kept.`);
                    }}
                  >
                    <XIcon />
                  </Button>
                ) : (
                  // Standard steps cannot leave the night; keep the columns aligned.
                  <span className="size-7" aria-hidden="true" />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <section aria-labelledby="tray-title" className="flex flex-col gap-2 border-t pt-5">
        <div className="flex flex-col gap-0.5">
          <h3 id="tray-title" className="font-medium">
            Not in this night
          </h3>
          <p className="text-sm text-muted-foreground">
            Added Characters go immediately before Dawn.
          </p>
        </div>
        {absent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {characters.length === 0
              ? "Characters you add to the Script will appear here."
              : `Every Character acts on ${label === "First Night" ? "the First Night" : "Other Nights"}.`}
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {absent.map((character) => {
              const name = characterTitle(character);

              return (
                <li key={character.id} className="flex items-center gap-2 px-2 py-1">
                  <CharacterToken character={character} className="size-6" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      character.name.trim() === "" && "text-muted-foreground",
                    )}
                  >
                    {name}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Add ${name} to ${label}`}
                    onClick={() => {
                      onChange(addBeforeDawn(order, character.id));
                      setAnnouncement(`${name} added to ${label} before Dawn.`);
                    }}
                  >
                    <PlusIcon />
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
