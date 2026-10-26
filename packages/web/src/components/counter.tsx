import { textLength } from "@alchemist/domain";
import { cn } from "cn";

// Export limits are not enforced while typing, so drafts can run over them.
export function Counter({ value, limit }: { readonly value: string; readonly limit: number }) {
  return (
    <span className={cn("tabular-nums", textLength(value) > limit && "text-destructive")}>
      {textLength(value)}/{limit} characters
    </span>
  );
}
