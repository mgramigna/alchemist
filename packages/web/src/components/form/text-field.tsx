import { useSelector } from "@tanstack/react-form";
import { useFieldContext } from "../../hooks/form-context.ts";
import { Input } from "../ui/input.tsx";
import { FieldControl, type FieldShellProps, type NativeControlProps } from "./field-control.tsx";

export function TextField({
  label,
  description,
  id,
  className,
  ...inputProps
}: FieldShellProps & NativeControlProps<"input">) {
  const field = useFieldContext<string>();
  const value = useSelector(field.store, (state) => state.value);

  return (
    <FieldControl
      label={label}
      description={description}
      id={id}
      className={className}
      disabled={inputProps.disabled}
    >
      {(control) => (
        <Input
          {...inputProps}
          {...control}
          value={value}
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </FieldControl>
  );
}
