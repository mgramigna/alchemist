import type { ComponentProps } from "react";
import { useFormContext } from "../../hooks/form-context.ts";

/** A `<form>` that submits through TanStack Form instead of the browser. */
export function Form(props: Omit<ComponentProps<"form">, "onSubmit">) {
  const form = useFormContext();

  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    />
  );
}
