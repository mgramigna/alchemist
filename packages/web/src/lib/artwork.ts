import { Cause, Exit, Predicate, Result } from "effect";

/** What to tell the owner when publishing or restyling Character artwork fails. */
export const artworkFailureMessage = (exit: Exit.Exit<unknown, unknown>, fallback: string) => {
  if (Exit.isSuccess(exit)) return fallback;
  const error = Cause.findError(exit.cause);

  if (Result.isFailure(error)) return fallback;

  if (
    Predicate.isTagged(error.success, "ArtworkInvalid") &&
    Predicate.hasProperty(error.success, "message")
  )
    return String(error.success.message);

  if (Predicate.isTagged(error.success, "ArtworkConflict"))
    return "This artwork changed in another tab. Reload to see the latest version.";

  return fallback;
};
