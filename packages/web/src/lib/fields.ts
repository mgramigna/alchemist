export const REMINDER_TITLES = {
  reminders: "Reminder Tokens",
  remindersGlobal: "Global Reminder Tokens",
} as const;

// How export and import problems name the field they point at.
const FIELD_LABELS = new Map([
  ["name", "Name"],
  ["ability", "Ability"],
  ["team", "Team"],
  ["authorCredit", "Author Credit"],
  ["firstNightInstructions", "First Night instructions"],
  ["otherNightInstructions", "Other Nights instructions"],
  ["firstNight", "First Night"],
  ["otherNight", "Other Nights"],
  ["reminders", REMINDER_TITLES.reminders],
  ["remindersGlobal", REMINDER_TITLES.remindersGlobal],
  ["flavor", "Flavor text"],
  ["characters", "Characters"],
  ["jinx", "Jinx"],
  ["id", "Character ID"],
  ["schema", "JSON format"],
]);

export const fieldLabel = (field: string) => FIELD_LABELS.get(field) ?? field;
