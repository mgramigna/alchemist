/** JSON Schema string lengths count Unicode code points, not UTF-16 code units. */
export const textLength = (text: string): number => Array.from(text).length;
