import { SOURCE_TYPES, type Character, type CharacterId } from "@alchemist/domain";
import {
  CheckCircleIcon,
  ImagesIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import { useRef, useState, type DragEvent } from "react";
import type { BulkIcons } from "../hooks/use-bulk-icons.ts";
import { assignedTo, publishable, type BulkImage } from "../lib/bulk-icons.ts";
import { characterTitle, groupByTeam, teamPluralLabel } from "../lib/characters.ts";
import { CharacterToken } from "./character-token.tsx";
import { Button } from "./ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";
import { Spinner } from "./ui/spinner.tsx";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** Upload images for several Characters at once, then assign each to its Character. */
export function BulkIconUpload({
  bulk,
  characters,
  onOpen,
}: {
  readonly bulk: BulkIcons;
  readonly characters: ReadonlyArray<Character>;
  readonly onOpen: (id: CharacterId) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { images, progress, publishing } = bulk;
  const ready = publishable(images, characters);
  const published = images.filter(({ state }) => state.kind === "published").length;

  const withoutImage = characters.filter(
    (character) =>
      character.artwork === undefined &&
      !images.some((image) => assignedTo(image, characters) === character.id),
  );

  const choose = (files: FileList | null) => {
    if (files !== null && files.length > 0) void bulk.add([...files]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  };

  return (
    <section
      aria-labelledby="bulk-title"
      className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-5 lg:col-span-5 lg:self-start"
    >
      <div className="flex flex-col gap-1">
        <h2 id="bulk-title" className="text-xl font-semibold">
          Upload icons
        </h2>
        <p className="text-sm text-muted-foreground">
          Add images for several Characters at once. Images named after a Character are assigned to
          it; check each one, then publish. Each is styled automatically, and you can fine-tune it
          later from its Character. Images aren’t saved until they’re published.
        </p>
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 transition-colors",
          dragging && "border-ring bg-muted",
        )}
      >
        <input
          ref={input}
          type="file"
          multiple
          accept={SOURCE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            choose(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          <UploadSimpleIcon />
          Choose images
        </Button>
        <span className="text-xs text-muted-foreground">
          PNG, JPEG, WebP or GIF up to 10 MB each. You can also drop images here.
        </span>
      </div>
      {images.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImagesIcon className="size-4" />
          No images chosen yet.
        </p>
      ) : (
        <ul aria-label="Images" className="flex flex-col divide-y">
          {images.map((image) => (
            <BulkImageRow
              key={image.key}
              image={image}
              url={bulk.urls.get(image.key)}
              images={images}
              characters={characters}
              onAssign={(id) => bulk.assign(image.key, id)}
              onRemove={() => bulk.remove(image.key)}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-5">
          <Button disabled={publishing || ready.length === 0} onClick={() => void bulk.publish()}>
            {publishing ? <Spinner aria-hidden="true" role={undefined} /> : <UploadSimpleIcon />}
            {publishing
              ? "Publishing…"
              : ready.length === 0
                ? "Publish icons"
                : `Publish ${plural(ready.length, "icon")}`}
          </Button>
          <Button variant="ghost" disabled={publishing} onClick={bulk.clear}>
            Clear all
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {progress !== null
              ? `Publishing ${progress.done + 1} of ${progress.total}…`
              : published > 0
                ? `${plural(published, "icon")} published.`
                : ""}
          </p>
        </div>
      )}
      {withoutImage.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Still using generic icons: {withoutImage.map(characterTitle).join(", ")}.
        </p>
      )}
    </section>
  );
}

function BulkImageRow({
  image,
  url,
  images,
  characters,
  onAssign,
  onRemove,
  onOpen,
}: {
  readonly image: BulkImage;
  readonly url: string | undefined;
  readonly images: ReadonlyArray<BulkImage>;
  readonly characters: ReadonlyArray<Character>;
  readonly onAssign: (id: CharacterId | null) => void;
  readonly onRemove: () => void;
  readonly onOpen: (id: CharacterId) => void;
}) {
  const { state } = image;
  const characterId = assignedTo(image, characters);
  const character = characters.find(({ id }) => id === characterId);
  const locked = state.kind === "publishing" || state.kind === "published";

  // Another image already claims these Characters.
  const taken = new Set(
    images.flatMap((other) =>
      other.key === image.key ? [] : (assignedTo(other, characters) ?? []),
    ),
  );

  const items = [
    { value: null, label: "Not assigned" },
    ...characters.map((c) => ({ value: c.id, label: characterTitle(c) })),
  ];

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {url !== undefined && <img src={url} alt="" className="size-full object-contain" />}
      </div>
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
        <span className="truncate text-sm font-medium" title={image.name}>
          {image.name}
        </span>
        {image.problem === undefined ? (
          <Select
            items={items}
            value={characterId}
            disabled={locked}
            onValueChange={(value) => onAssign(value)}
          >
            <SelectTrigger
              size="sm"
              className="w-full max-w-64"
              aria-label={`Character for ${image.name}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Not assigned</SelectItem>
              {groupByTeam(characters).map(
                ({ team, characters: members }) =>
                  members.length > 0 && (
                    <SelectGroup key={team}>
                      <SelectLabel>{teamPluralLabel(team)}</SelectLabel>
                      {members.map((member) => (
                        <SelectItem
                          key={member.id}
                          value={member.id}
                          disabled={taken.has(member.id)}
                        >
                          <CharacterToken character={member} className="size-4" />
                          {characterTitle(member)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ),
              )}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-destructive">{image.problem}</p>
        )}
        <RowStatus image={image} character={character} onOpen={onOpen} />
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${image.name}`}
        disabled={state.kind === "publishing"}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  );
}

function RowStatus({
  image,
  character,
  onOpen,
}: {
  readonly image: BulkImage;
  readonly character: Character | undefined;
  readonly onOpen: (id: CharacterId) => void;
}) {
  const { state } = image;

  if (image.problem !== undefined) return null;

  if (state.kind === "publishing")
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner aria-hidden="true" role={undefined} className="size-3" />
        Publishing…
      </p>
    );

  if (state.kind === "published")
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircleIcon className="size-3.5" />
        Published
        {character !== undefined && (
          <>
            {" · "}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => onOpen(character.id)}
            >
              Open {characterTitle(character)}
            </Button>
          </>
        )}
      </p>
    );

  if (state.kind === "failed")
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <WarningCircleIcon className="size-3.5" />
        {state.message}
      </p>
    );

  if (character?.artwork !== undefined)
    return <p className="text-xs text-muted-foreground">Replaces its current icons.</p>;

  return null;
}
