import { JsonSchema, Schema, SchemaRepresentation } from "effect";
import officialSchema from "./botc-script.json" with { type: "json" };

// Basic absolute-URI syntax: a scheme, ASCII URI characters and valid percent
// escapes. This deliberately does not validate scheme-specific host/port rules.
// The final assertion requires the actual end of input, including after newlines.
const absoluteUri =
  /^[A-Za-z][A-Za-z0-9+.-]*:(?:[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*(?![\s\S])/;

const botcSchema = SchemaRepresentation.fromJsonSchemaDocument(
  JsonSchema.fromSchemaDraft2020_12(officialSchema),
  {
    patterns: "apply",
    onEnter: (node) => {
      if (node.format !== "uri") return node;
      const { format: _format, ...constraints } = node;

      // Remove format before revisiting this node, and retain every original
      // constraint (including any pattern) in the intersection.
      return { allOf: [constraints, { type: "string", pattern: absoluteUri.source }] };
    },
  },
);

// Imported JSON Schema contains validation only. toType removes the generic
// importer return type's unknown service requirements without a type assertion.
// Strict decoding is essential for oneOf: ignoring excess properties would let
// a Custom Character also match the deprecated { id } alternative.
export const decodeBotcDocument = Schema.decodeUnknownResult(Schema.toType(botcSchema), {
  onExcessProperty: "error",
  errors: "all",
});
