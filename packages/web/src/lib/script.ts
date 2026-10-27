export const scriptTitle = (name: string) => name.trim() || "Untitled Script";

/** A public link the official BOTC app can import; it always serves the latest saved Script. */
export const scriptJsonUrl = (id: string) =>
  new URL(`/scripts/${encodeURIComponent(id)}/json`, window.location.origin).href;
