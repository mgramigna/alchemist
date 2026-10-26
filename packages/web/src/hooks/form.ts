import { createFormHook } from "@tanstack/react-form";
import { CheckboxField } from "../components/form/checkbox-field.tsx";
import { FieldControl } from "../components/form/field-control.tsx";
import { Form } from "../components/form/form.tsx";
import { SelectField } from "../components/form/select-field.tsx";
import { SubmitButton } from "../components/form/submit-button.tsx";
import { SwitchField } from "../components/form/switch-field.tsx";
import { TextareaField } from "../components/form/textarea-field.tsx";
import { TextField } from "../components/form/text-field.tsx";
import { fieldContext, formContext } from "./form-context.ts";

// The app's form hook. Prefer `useAppForm` over `useForm` so fields get the
// pre-bound components below; split large forms with `withForm` and reuse
// related fields with `withFieldGroup`. Validate with Effect Schema through
// `Schema.toStandardSchemaV1(schema)`, not Zod.
export const { useAppForm, withForm, withFieldGroup, useTypedAppFormContext } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    Control: FieldControl,
    TextField,
    TextareaField,
    SelectField,
    SwitchField,
    CheckboxField,
  },
  formComponents: {
    Form,
    SubmitButton,
  },
});
