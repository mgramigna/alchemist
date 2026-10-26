import { useSelector } from "@tanstack/react-form";
import { Schema } from "effect";
import { useId, type ComponentProps, type JSX, type ReactNode } from "react";
import { useFieldContext } from "../../hooks/form-context.ts";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "../ui/field.tsx";

/** Props to spread onto the element that edits a field's value. */
export interface ControlProps {
  readonly id: string;
  readonly name: string;
  readonly onBlur: () => void;
  readonly "aria-invalid": boolean;
  readonly "aria-describedby": string | undefined;
}

export interface FieldShellProps {
  readonly label: ReactNode;
  readonly description?: ReactNode | undefined;
  /** Overrides the generated control id, e.g. for stable test selectors. */
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly disabled?: boolean | undefined;
}

type FieldErrors = Array<{ message: string }>;

const isMessage = Schema.is(Schema.String);
const isIssue = Schema.is(Schema.Struct({ message: Schema.String }));

// Validators may return strings, Standard Schema issues, or arrays of either.
function toFieldErrors(errors: ReadonlyArray<unknown>): FieldErrors {
  return errors.flatMap((error): FieldErrors => {
    if (isMessage(error)) {
      return [{ message: error }];
    }

    if (Array.isArray(error)) {
      return toFieldErrors(error);
    }

    return isIssue(error) ? [{ message: error.message }] : [];
  });
}

function useFieldState({
  id: idOverride,
  description,
}: Pick<FieldShellProps, "id" | "description">) {
  const field = useFieldContext<unknown>();
  const generatedId = useId();
  const id = idOverride ?? generatedId;
  const invalid = useSelector(field.store, (state) => state.meta.isTouched && !state.meta.isValid);
  const errors = useSelector(field.store, (state) => state.meta.errors);

  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = invalid ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const control: ControlProps = {
    id,
    name: field.name,
    onBlur: field.handleBlur,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
  };

  return { control, invalid, errors: toFieldErrors(errors), descriptionId, errorId };
}

interface FieldControlProps extends FieldShellProps {
  readonly orientation?: "vertical" | "horizontal" | "responsive";
  /** Where the control sits in horizontal layouts. */
  readonly controlPosition?: "start" | "end";
  readonly children: (control: ControlProps) => ReactNode;
}

/**
 * Label, description, and error wiring for any control. Read the value and
 * change handler from the `field` passed to `form.AppField`:
 *
 * ```tsx
 * <form.AppField name="language">
 *   {(field) => (
 *     <field.Control label="Language">
 *       {(control) => (
 *         <Select value={field.state.value} onValueChange={field.handleChange}>
 *           <SelectTrigger {...control}>…</SelectTrigger>
 *         </Select>
 *       )}
 *     </field.Control>
 *   )}
 * </form.AppField>
 * ```
 */
export function FieldControl({
  label,
  description,
  id,
  className,
  disabled,
  orientation = "vertical",
  controlPosition = "end",
  children,
}: FieldControlProps) {
  const { control, invalid, errors, descriptionId, errorId } = useFieldState({ id, description });

  const labelElement = (
    <FieldLabel
      htmlFor={control.id}
      className={orientation === "vertical" ? undefined : "font-normal"}
    >
      {label}
    </FieldLabel>
  );

  const details = (
    <>
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      {invalid && <FieldError id={errorId} errors={errors} />}
    </>
  );

  if (orientation === "vertical") {
    return (
      <Field data-invalid={invalid} data-disabled={disabled} className={className}>
        {labelElement}
        {children(control)}
        {details}
      </Field>
    );
  }

  return (
    <Field
      orientation={orientation}
      data-invalid={invalid}
      data-disabled={disabled}
      className={className}
    >
      {controlPosition === "start" && children(control)}
      <FieldContent>
        {labelElement}
        {details}
      </FieldContent>
      {controlPosition === "end" && children(control)}
    </Field>
  );
}

/** Native element props a pre-bound field passes through to its control. */
export type NativeControlProps<T extends keyof JSX.IntrinsicElements> = Omit<
  ComponentProps<T>,
  "id" | "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "children"
>;
