import { useSelector } from "@tanstack/react-form";
import { useFieldContext } from "../../hooks/form-context.ts";
import { Switch } from "../ui/switch.tsx";
import { FieldControl, type FieldShellProps } from "./field-control.tsx";

export function SwitchField({ label, description, id, className, disabled }: FieldShellProps) {
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
    >
      {(control) => (
        <Switch
          {...control}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => field.handleChange(next)}
        />
      )}
    </FieldControl>
  );
}
