import { useSelector } from "@tanstack/react-form";
import { useFieldContext } from "../../hooks/form-context.ts";
import { Checkbox } from "../ui/checkbox.tsx";
import { FieldControl, type FieldShellProps } from "./field-control.tsx";

export function CheckboxField({ label, description, id, className, disabled }: FieldShellProps) {
  const field = useFieldContext<boolean>();
  const checked = useSelector(field.store, (state) => state.value);

  return (
    <FieldControl
      label={label}
      description={description}
      id={id}
      className={className}
      disabled={disabled}
      orientation="horizontal"
      controlPosition="start"
    >
      {(control) => (
        <Checkbox
          {...control}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => field.handleChange(next)}
        />
      )}
    </FieldControl>
  );
}
