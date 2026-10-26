import { useSelector } from "@tanstack/react-form";
import { useFieldContext } from "../../hooks/form-context.ts";
import { Textarea } from "../ui/textarea.tsx";
import { FieldControl, type FieldShellProps, type NativeControlProps } from "./field-control.tsx";

export function TextareaField({
  label,
  description,
  id,
  className,
  ...textareaProps
}: FieldShellProps & NativeControlProps<"textarea">) {
  const field = useFieldContext<string>();
  const value = useSelector(field.store, (state) => state.value);

  return (
    <FieldControl
      label={label}
      description={description}
      id={id}
      className={className}
      disabled={textareaProps.disabled}
    >
      {(control) => (
        <Textarea
          {...textareaProps}
          {...control}
          value={value}
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </FieldControl>
  );
}
