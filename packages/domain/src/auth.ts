import { Schema } from "effect";

export const DisplayName = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.isPattern(/\S/),
);

export const User = Schema.Struct({ id: Schema.String, displayName: DisplayName });

export interface User extends Schema.Schema.Type<typeof User> {}

export class AuthRejected extends Schema.TaggedError<
  AuthRejected,
  { readonly brand: unique symbol }
>()("AuthRejected", {}) {}

export class AuthUnavailable extends Schema.TaggedError<
  AuthUnavailable,
  { readonly brand: unique symbol }
>()("AuthUnavailable", {}) {}
