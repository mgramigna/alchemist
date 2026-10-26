import { useSelector } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { useFieldContext } from "../../hooks/form-context.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { FieldControl, type FieldShellProps } from "./field-control.tsx";

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
}

interface SelectFieldProps<T extends string> extends FieldShellProps {
  readonly options: ReadonlyArray<SelectOption<T>>;
  readonly placeholder?: ReactNode;
}

/** Choose one of `options`. The field value is always one of their values. */
export function SelectField<T extends string>({
  label,
  description,
  id,
  className,
  disabled,
  options,
  placeholder,
}: SelectFieldProps<T>) {
  const field = useFieldContext<T>();
  const value = useSelector(field.store, (state) => state.value);

  return (
    <FieldControl
      label={label}
      description={description}
      id={id}
      className={className}
      disabled={disabled}
    >
      {({ name, ...control }) => (
        <Select
          name={name}
          items={options}
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            const option = options.find((candidate) => candidate.value === next);

            if (option) field.handleChange(option.value);
          }}
        >
          <SelectTrigger {...control} className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldControl>
  );
}
