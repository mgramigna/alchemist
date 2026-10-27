`botc-script.json` is the official [BOTC Script schema](https://github.com/ThePandemoniumInstitute/botc-release/blob/f10cd02e3401af227ce406287eaae7bb99a06a42/script-schema.json), pinned to commit `f10cd02e3401af227ce406287eaae7bb99a06a42` (JSON Schema draft 2020-12). Only formatting differs from the upstream file. There is no runtime network fetch or validator generation step.

The copied schema is excluded from Alchemist's MIT license. Upstream documents
its use for validation, but a separate redistribution license has not been
identified. See [third-party notices](../../../../THIRD_PARTY_NOTICES.md#blood-on-the-clocktower)
for provenance, the upstream policy, and the unconfirmed redistribution terms.

`botc.ts` imports it through Effect's `JsonSchema` and `SchemaRepresentation` APIs. Patterns are applied, and strict decoding rejects excess properties in closed objects. Strict decoding also preserves `oneOf` semantics: a complete Custom Character must not simultaneously match the deprecated `{ id }` alternative. The imported schema contains validation only, so `Schema.toType` provides a synchronous decoder without asserting away the importer's generic service requirements.

Effect treats URI formats as annotations. The importer adds a small absolute-URI pattern to each URI node, intersecting it with the existing constraints. It requires a scheme, ASCII URI characters and valid percent escapes, and rejects relative references, whitespace, control characters and raw Unicode. HTTP URLs, IPv6 literals, URNs and mailto forms are supported. This is a deliberate syntax check, not a complete RFC URI parser: scheme-specific authority, host and port rules are outside its scope. Current export image URLs are additionally constructed with the platform `URL` API from the configured application origin.

Application content rules (nonblank text, unique names, valid relationships and complete Night Orders) live in `../export.ts`, alongside serialization. The API rechecks these against saved owner-scoped records, then validates the entire serialized document before returning a download. Tests assert valid documents and explicit invalid fixtures rather than comparing against a second validation dependency.
