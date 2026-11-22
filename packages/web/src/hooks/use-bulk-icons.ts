import {
  AUTO_STYLE,
  sniffImageType,
  sourceProblem,
  type Character,
  type CharacterArtwork,
  type CharacterId,
  type ScriptId,
} from "@alchemist/domain";
import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { useEffect, useRef, useState } from "react";
import { bulkUploadArtwork } from "../api.ts";
import { artworkFailureMessage } from "../lib/artwork.ts";
import {
  assign as assignImage,
  assignedTo,
  autoAssign,
  publishable,
  setState,
  type BulkImage,
} from "../lib/bulk-icons.ts";
import { StylizeFailed, cutOut, decodeSource, renderVariants } from "../lib/stylize.ts";

/**
 * Images chosen for bulk upload, kept by the Workbench so they survive switching
 * pages. They live only in the browser: anything unpublished is gone on reload.
 * Publishing styles each image with the automatic style and uploads it, one at a time.
 */
export function useBulkIcons(
  scriptId: ScriptId,
  characters: ReadonlyArray<Character>,
  onArtwork: (id: CharacterId, artwork: CharacterArtwork) => void,
) {
  const upload = useAtomSet(bulkUploadArtwork, { mode: "promiseExit" });
  const [images, setImages] = useState<ReadonlyArray<BulkImage>>([]);
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  // How far the current Publish has got, or null when not publishing.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const running = useRef(false);
  const latest = useRef(images);
  const roster = useRef(characters);
  roster.current = characters;
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  const update = (change: (current: ReadonlyArray<BulkImage>) => ReadonlyArray<BulkImage>) => {
    latest.current = change(latest.current);
    setImages(latest.current);
  };

  const open = useRef(true);

  // Thumbnails are object URLs, released when their image leaves or the Workbench closes.
  // Closing the Workbench also stops a Publish after the image in progress.
  useEffect(() => {
    open.current = true;

    return () => {
      open.current = false;
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const add = async (files: ReadonlyArray<File>) => {
    const read = await Promise.all(
      files.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());

        const image: BulkImage = {
          key: crypto.randomUUID(),
          name: file.name,
          bytes,
          problem: sourceProblem(bytes),
          characterId: null,
          state: { kind: "ready" },
        };

        return { image, url: image.problem === undefined ? URL.createObjectURL(file) : undefined };
      }),
    );

    setUrls((current) => {
      const next = new Map(current);

      for (const { image, url } of read) if (url !== undefined) next.set(image.key, url);

      return next;
    });
    update((current) => [
      ...current,
      ...autoAssign(
        current,
        read.map(({ image }) => image),
        roster.current,
      ),
    ]);
  };

  const release = (keys: ReadonlyArray<string>) =>
    setUrls((current) => {
      const next = new Map(current);

      for (const key of keys) {
        const url = next.get(key);

        if (url !== undefined) URL.revokeObjectURL(url);
        next.delete(key);
      }

      return next;
    });

  const remove = (key: string) => {
    update((current) => current.filter((image) => image.key !== key));
    release([key]);
  };

  const clear = () => {
    const keys = latest.current.map(({ key }) => key);
    update(() => []);
    release(keys);
  };

  const assign = (key: string, characterId: CharacterId | null) =>
    update((current) => assignImage(current, key, characterId));

  const publishOne = async (image: BulkImage, character: Character) => {
    const style = AUTO_STYLE;
    const { team } = character;

    try {
      const type = sniffImageType(image.bytes);
      const decoded = await decodeSource(new Blob([image.bytes], type && { type }));
      const variants = await renderVariants(cutOut(decoded, style), team, style);

      const exit = await upload({
        payload: { scriptId, id: character.id, source: image.bytes, style, team, variants },
      });

      if (Exit.isFailure(exit))
        return update((current) =>
          setState(current, image.key, {
            kind: "failed",
            message: artworkFailureMessage(
              exit,
              "Couldn’t save this icon. The Character’s previous icons are unchanged.",
            ),
          }),
        );

      onArtwork(character.id, exit.value);
      update((current) => setState(current, image.key, { kind: "published" }));
    } catch (error) {
      update((current) =>
        setState(current, image.key, {
          kind: "failed",
          message:
            error instanceof StylizeFailed
              ? error.message
              : "Couldn’t style this image. Try another.",
        }),
      );
    }
  };

  const publish = async () => {
    if (running.current) return;
    running.current = true;
    const queue = publishable(latest.current, roster.current);

    try {
      // One at a time: styling is heavy, and each upload replaces a Character's icons.
      for (const [done, image] of queue.entries()) {
        setProgress({ done, total: queue.length });
        const current = latest.current.find(({ key }) => key === image.key);
        const id = current && assignedTo(current, roster.current);
        const character = roster.current.find((candidate) => candidate.id === id);

        if (!open.current) break;

        // Removed, unassigned or its Character deleted while earlier images published.
        if (current === undefined || character === undefined) continue;
        update((all) => setState(all, image.key, { kind: "publishing" }));
        await publishOne(current, character);
      }
    } finally {
      running.current = false;
      setProgress(null);
    }
  };

  return {
    images,
    urls,
    progress,
    publishing: progress !== null,
    add,
    remove,
    clear,
    assign,
    publish,
  };
}

export type BulkIcons = ReturnType<typeof useBulkIcons>;
