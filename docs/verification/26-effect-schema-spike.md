# Effect Schema import for BOTC JSON

## Implemented decision

Following the spike, the maintainer accepted a small URI syntax check in exchange for removing AJV. Production now uses Effect's importer directly on the pinned official schema. The AJV generator, generated validator/declaration, comparison script, direct dependencies and formatting/lint exceptions have been removed. Existing development tooling still depends on AJV transitively; application code and tests do not import it.

The implementation is `packages/domain/src/schemas/botc.ts`. It uses:

```ts
const schema = SchemaRepresentation.fromJsonSchemaDocument(
  JsonSchema.fromSchemaDraft2020_12(officialSchema),
  { patterns: "apply", onEnter },
);
const decode = Schema.decodeUnknownResult(Schema.toType(schema), {
  onExcessProperty: "error",
  errors: "all",
});
```

The importer returns `Schema.Top`, with generic service requirements. Imported JSON Schema contains checks rather than transformations, so `Schema.toType` supplies a synchronous validation schema without a type assertion. Use strict decoding rather than `Schema.is`: permissive object guards can make Custom Characters also match the deprecated `{ id }` branch, violating `oneOf`.

`onEnter` augments every `format: "uri"` node with an absolute-URI pattern while retaining its existing constraints. This checks schemes, ASCII URI characters and percent escapes. It rejects relative references, whitespace/control characters, raw Unicode and malformed escapes; it accepts HTTP, IPv6, URNs and mailto. It deliberately does not implement scheme-specific host/port validation. Current exported image URLs are constructed with the platform `URL` API from configured APP_ORIGIN.

The official whole-document sizes, text limits, closed/open property rules, patterns, types and unions remain imported from the checked-in source. Shared blockers and UI counters use Unicode code points to match official text lengths. Invalid drafts remain savable, with export enforcing the limits.

## Spike evidence

The initial Node experiment used installed `effect@4.0.6` and the official BOTC schema at `f10cd02e3401af227ce406287eaae7bb99a06a42`. A strict Effect decoder with patterns applied agreed with AJV across 44 structural fixtures, beyond 12 initial probes. Cases included array/text limits, Unicode boundaries, metadata extensions, closed Character properties, ID patterns, Teams, priorities, Reminder Tokens, Jinxes, edition/special fields and official/deprecated entries.

Unaugmented Effect accepted 35 invalid URI values across 60 URI cases (12 strings in image-string/image-array/logo/background/almanac positions). Effect treats format as an annotation, which is permitted by JSON Schema 2020-12; the small pattern now supplies the application's assertion. The comparison script was removed with AJV, and production fixture tests retain explicit expectations for structural constraints and valid/invalid URI syntax in all five positions. This bounded comparison was evidence for this pinned schema, not proof of general validator equivalence.

Sources: installed `effect/src/SchemaRepresentation.ts` (`fromJsonSchemaDocument` and `FromJsonSchemaOptions`), `effect/src/internal/schema/fromJsonSchemaDocument.ts` (format annotations and Unicode checks), and `effect/src/Schema.ts` (`toType`). See [official upstream importer source](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/SchemaRepresentation.ts) and [JSON Schema format semantics](https://json-schema.org/draft/2020-12/json-schema-validation#name-format).

## Scope and verification

Effect's importer supports a subset of JSON Schema. Conditional/dependent/unevaluated keywords, reference restrictions and structured enum/const limitations must be reviewed when repinning. None are used by this pinned schema. Unknown extension keywords are ignored; input schemas are assumed valid rather than checked against the meta-schema.

Root verification, the production build and focused Chromium JSON-download/Unicode-counter journeys pass after the replacement. Official-app Jinx interoperability remains the external release blocker recorded in `26-json-export.md`.
