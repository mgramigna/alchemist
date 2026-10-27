import { useState, type ReactNode } from "react";
import { useAtom } from "@effect/atom-react";
import type { OwnedScript } from "@alchemist/domain";
import { TrashIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { Exit } from "effect";
import { AsyncResult } from "effect/reactivity";
import { toast } from "sonner";
import { deleteScript, ScriptKeys } from "../api.ts";
import { scriptTitle } from "../lib/script.ts";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";
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
  return (
    <DeleteScriptDialog script={script}>
      <Tooltip>
        <TooltipTrigger
          render={
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete Script"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive aria-expanded:bg-destructive/10 aria-expanded:text-destructive"
                />
              }
            />
          }
        >
          <TrashIcon />
        </TooltipTrigger>
        <TooltipContent>Delete Script</TooltipContent>
      </Tooltip>
    </DeleteScriptDialog>
  );
}

export function DeleteScriptSection({ script }: { readonly script: OwnedScript }) {
  const navigate = useNavigate();

  return (
    <section aria-labelledby="delete-script-title" className="flex flex-col gap-2 border-t pt-5">
      <h3 id="delete-script-title" className="font-medium">
        Delete Script
      </h3>
      <p className="text-sm text-muted-foreground">
        Permanently remove this Script, its Characters, and its share page.
      </p>
      <DeleteScriptDialog
        script={script}
        onDeleted={() => {
          toast.success(`Deleted ${scriptTitle(script.name)}`);
          void navigate({ to: "/" });
        }}
      >
        <AlertDialogTrigger
          render={<Button type="button" variant="destructive" size="sm" className="w-fit" />}
        >
          <TrashIcon />
          Delete Script
        </AlertDialogTrigger>
      </DeleteScriptDialog>
    </section>
  );
}

function DeleteScriptDialog({
  script,
  onDeleted,
  children,
}: {
  readonly script: OwnedScript;
  readonly onDeleted?: () => void;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [result, remove] = useAtom(deleteScript, { mode: "promiseExit" });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!result.waiting) setOpen(next);
      }}
    >
      {children}
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

              if (Exit.isSuccess(exit)) {
                setOpen(false);
                onDeleted?.();
              }
            }}
          >
            {result.waiting ? "Deleting…" : "Permanently delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
