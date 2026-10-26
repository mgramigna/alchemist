import { createFormHookContexts } from "@tanstack/react-form";

// Field and form components must read these contexts, not ones from another
// `createFormHookContexts` call, so `form.AppField` and `form.AppForm` reach them.
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();
