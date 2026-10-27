import {
  moveEntry,
  sortCharacters,
  type AuthoredTeam,
  type Character,
  type CharacterId,
  type CharacterOrder,
  type CharacterSort,
  type NightOrders,
} from "@alchemist/domain";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsSixVerticalIcon,
  ListNumbersIcon,
  SortAscendingIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { characterTitle, groupByTeam, teamPluralLabel } from "../lib/characters.ts";
import { CharacterToken } from "./characters.tsx";
import { Button } from "./ui/button.tsx";

type Direction = "up" | "down";

const SORT_LABELS: Record<CharacterSort, string> = {
  standard: "Standard order",
  alphabetical: "alphabetical order",
};

/**
 * The order Characters appear in on the sheet and in exports. Sorting
 * rearranges every Team only when asked, so editing an ability never moves its
 * Character; afterwards Characters move within their Team by dragging or with
 * their move buttons.
 */
export function CharacterOrderEditor({
  characters,
  nightOrders,
  onChange,
  onSelect,
}: {
  readonly characters: ReadonlyArray<Character>;
  readonly nightOrders: NightOrders;
  readonly onChange: (order: CharacterOrder) => void;
  readonly onSelect: (id: CharacterId) => void;
}) {
  const [announcement, setAnnouncement] = useState("");
  const [dragFrom, setDragFrom] = useState<{ team: AuthoredTeam; index: number } | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const groups = groupByTeam(characters).filter((group) => group.characters.length > 0);

  // Moving a row re-inserts its DOM node, which drops focus; restore it afterwards.
  const [focusAfterMove, setFocusAfterMove] = useState<{
    readonly id: CharacterId;
    readonly direction: Direction;
  } | null>(null);

  useEffect(() => {
    if (focusAfterMove === null) return;

    const { id, direction } = focusAfterMove;
    const members = groups.find((group) => group.characters.some((c) => c.id === id))?.characters;
    const index = members?.findIndex((c) => c.id === id) ?? -1;
    // At either end the pressed button disables, so focus its partner instead.
    const atEnd = direction === "up" ? index === 0 : index === (members?.length ?? 0) - 1;
    const target = atEnd ? (direction === "up" ? "down" : "up") : direction;

    buttons.current.get(`${id}:${target}`)?.focus();
    setFocusAfterMove(null);
  }, [focusAfterMove, groups]);

  const move = (team: AuthoredTeam, from: number, to: number) => {
    const members = groups.find((group) => group.team === team)?.characters ?? [];
    const ids = members.map(({ id }) => id);
    const moved = moveEntry(ids, from, to);
    const character = members[from];

    if (character === undefined || moved === ids) return;

    // Teams stay together, in Team order, with this Team rearranged.
    onChange(
      groups.flatMap((group) =>
        group.team === team ? moved : group.characters.map(({ id }) => id),
      ),
    );
    setAnnouncement(
      `${characterTitle(character)} moved to position ${to + 1} of ${members.length} ${teamPluralLabel(team)}.`,
    );
  };

  const sort = (by: CharacterSort) => {
    onChange(sortCharacters(characters, by, nightOrders).map(({ id }) => id));
    setAnnouncement(`Characters sorted in ${SORT_LABELS[by]}.`);
  };

  const ref = (key: string) => (element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(key, element);
    else buttons.current.delete(key);
  };

  return (
    <section
      aria-labelledby="order-title"
      className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-5 lg:col-span-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="order-title" className="text-xl font-semibold">
          Character Order
        </h2>
        <p className="text-sm text-muted-foreground">
          The order Characters appear in on the sheet and in exports. Sort them, then drag or use
          the arrow buttons to adjust within each Team. Characters don’t move as you edit them.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={characters.length === 0}
          onClick={() => sort("standard")}
        >
          <ListNumbersIcon />
          Sort in Standard order
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={characters.length === 0}
          onClick={() => sort("alphabetical")}
        >
          <SortAscendingIcon />
          Sort alphabetically
        </Button>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Standard order groups each Team’s abilities by how they begin (“You start knowing”, “Each
        night”…), then puts shorter abilities first. Night actions decide “Each night” versus “Each
        night*”: Characters that skip the First Night sort as “Each night*”.
      </p>
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Characters you add to the Script will appear here.
        </p>
      )}
      {groups.map(({ team, characters: members }) => {
        const label = teamPluralLabel(team);

        return (
          <section key={team} aria-labelledby={`order-${team}`} className="flex flex-col gap-1">
            <h3
              id={`order-${team}`}
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {label}
            </h3>
            <ol aria-label={`${label} order`} className="-mx-2 flex flex-col">
              {members.map((character, index) => {
                const name = characterTitle(character);
                const dragging = dragFrom?.team === team ? dragFrom.index : null;

                return (
                  <li
                    key={character.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", name);
                      setDragFrom({ team, index });
                    }}
                    onDragOver={(event) => {
                      // Characters move only within their own Team.
                      if (dragging === null) return;
                      event.preventDefault();
                      setDropAt(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();

                      if (dragging !== null) move(team, dragging, index);
                      setDragFrom(null);
                      setDropAt(null);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDropAt(null);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border-y-2 border-transparent px-2 py-1.5",
                      dragging === index && "opacity-50",
                      dropAt === index &&
                        dragging !== null &&
                        dragging !== index &&
                        (dragging < index ? "border-b-primary" : "border-t-primary"),
                    )}
                  >
                    <DotsSixVerticalIcon
                      aria-hidden="true"
                      className="hidden size-4 shrink-0 cursor-grab text-muted-foreground sm:block"
                    />
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <CharacterToken character={character} className="size-8" />
                    <div className="flex min-w-0 flex-1 flex-col text-sm">
                      <button
                        type="button"
                        onClick={() => onSelect(character.id)}
                        className={cn(
                          "w-fit text-left font-medium wrap-anywhere hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          character.name.trim() === "" && "text-muted-foreground",
                        )}
                      >
                        {name}
                      </button>
                      <span className="line-clamp-2 text-xs text-muted-foreground wrap-anywhere">
                        {character.ability.trim() || <em>No ability yet.</em>}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button
                        ref={ref(`${character.id}:up`)}
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${name} up`}
                        disabled={index === 0}
                        onClick={() => {
                          move(team, index, index - 1);
                          setFocusAfterMove({ id: character.id, direction: "up" });
                        }}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        ref={ref(`${character.id}:down`)}
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${name} down`}
                        disabled={index === members.length - 1}
                        onClick={() => {
                          move(team, index, index + 1);
                          setFocusAfterMove({ id: character.id, direction: "down" });
                        }}
                      >
                        <ArrowDownIcon />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
