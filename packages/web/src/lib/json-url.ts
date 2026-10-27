import type { ScriptId } from "@alchemist/domain";

/** A public link to the current saved export, independent of the viewer's session. */
export const scriptJsonUrl = (id: ScriptId) =>
  new URL(`/api/scripts/${encodeURIComponent(id)}.json`, window.location.origin).href;
