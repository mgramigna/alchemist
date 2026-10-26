import { useSelector } from "@tanstack/react-form";
import type { ComponentProps, ReactNode } from "react";
import { useFormContext } from "../../hooks/form-context.ts";
import { Button } from "../ui/button.tsx";
import { Spinner } from "../ui/spinner.tsx";

interface SubmitButtonProps extends Omit<ComponentProps<typeof Button>, "type"> {
  /** Shown instead of `children` while the form submits. */
  readonly pendingLabel?: ReactNode;
  /** Keep the button disabled until a value differs from its default. */
  readonly requireChanges?: boolean;
}

export function SubmitButton({
  children,
  pendingLabel,
  requireChanges = false,
  disabled,
  ...props
}: SubmitButtonProps) {
  const form = useFormContext();
  const canSubmit = useSelector(form.store, (state) => state.canSubmit);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const unchanged = useSelector(form.store, (state) => state.isDefaultValue);

  return (
    <Button
      {...props}
      type="submit"
      disabled={disabled || !canSubmit || submitting || (requireChanges && unchanged)}
    >
      {submitting && <Spinner />}
      {submitting && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
