import { useState } from "react";
import { useAtom } from "@effect/atom-react";
import type { OwnedScript } from "@alchemist/domain";
import { Exit } from "effect";
import { AsyncResult } from "effect/reactivity";
import { deleteScript, ScriptKeys } from "../api.ts";
import { scriptTitle } from "../lib/script.ts";
import { Button } from "./ui/button.tsx";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog.tsx";

export function DeleteScriptButton({ script }: { readonly script: OwnedScript }) {
  const [open, setOpen] = useState(false);
  const [result, remove] = useAtom(deleteScript, { mode: "promiseExit" });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!result.waiting) setOpen(next);
      }}
    >
      <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive" />}>
        Delete Script
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{scriptTitle(script.name)}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the Script, its Characters, both Night Orders, Jinxes, and
            private artwork originals. Its share page will become unavailable. Previously exported
            artwork URLs will keep working. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {AsyncResult.isFailure(result) && !result.waiting && (
          <p role="alert" className="text-sm text-destructive">
            Deletion could not finish. The Script may already be unavailable. Retry to finish
            private artwork cleanup.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={result.waiting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={result.waiting}
            onClick={async () => {
              const exit = await remove({
                payload: { id: script.id },
                reactivityKeys: [ScriptKeys.owned, ScriptKeys.script(script.id)],
              });

              if (Exit.isSuccess(exit)) setOpen(false);
            }}
          >
            {result.waiting ? "Deleting…" : "Permanently delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
