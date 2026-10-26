import { ulid } from "ulid";

// BOTC Character IDs must be lowercase; use the same format for all generated IDs.
export const createId = () => ulid().toLowerCase();
