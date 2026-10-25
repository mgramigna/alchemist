// PROTOTYPE — throwaway. In-memory Script model shared by every editor variant.
// Mirrors the decisions in #7 (night order) and #8 (Custom Character model);
// the real versions belong in @alchemist/domain.

export type Team = "townsfolk" | "outsider" | "minion" | "demon" | "traveller" | "fabled" | "loric";

export const AUTHORABLE_TEAMS: ReadonlyArray<Team> = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
];

export const TEAM_LABEL: Record<Team, string> = {
  townsfolk: "Townsfolk",
  outsider: "Outsiders",
  minion: "Minions",
  demon: "Demons",
  traveller: "Travellers",
  fabled: "Fabled",
  loric: "Loric",
};

export type Alignment = "good" | "evil" | "none";

export const defaultAlignment = (team: Team): Alignment =>
  team === "townsfolk" || team === "outsider"
    ? "good"
    : team === "minion" || team === "demon"
      ? "evil"
      : "none";

export interface Character {
  id: string;
  name: string;
  team: Team;
  ability: string;
  firstNightInstructions: string;
  otherNightInstructions: string;
  reminders: string[];
  remindersGlobal: string[];
  setup: boolean;
  flavor: string;
}

export interface Jinx {
  id: string;
  a: string;
  b: string;
  reason: string;
}

export type Night = "firstNight" | "otherNight";

export const NIGHT_LABEL: Record<Night, string> = {
  firstNight: "First Night",
  otherNight: "Other Nights",
};

export type StepId = "dusk" | "minioninfo" | "demoninfo" | "dawn";

export const STEP_LABEL: Record<StepId, string> = {
  dusk: "Dusk",
  minioninfo: "Minion Info",
  demoninfo: "Demon Info",
  dawn: "Dawn",
};

export const STEP_TEXT: Record<StepId, string> = {
  dusk: "Start the night. Some travellers and fabled act now.",
  minioninfo: "If there are 7 or more players, wake all Minions: show them the Demon and each other.",
  demoninfo: "If there are 7 or more players, wake the Demon: show the Minions and 3 not-in-play good Characters.",
  dawn: "Wait a few seconds. Call for eyes open and announce who died.",
};

export const isStep = (id: string): id is StepId => id in STEP_LABEL;

export interface Script {
  name: string;
  author: string;
  characters: Character[];
  jinxes: Jinx[];
  // Entry IDs: Character IDs plus standard step IDs. ULIDs never collide with step IDs.
  firstNight: string[];
  otherNight: string[];
}

// ---------------------------------------------------------------------------
// IDs

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";
let lastTime = 0;
let counter = 0;

export const ulid = (): string => {
  const now = Date.now();
  counter = now === lastTime ? counter + 1 : 0;
  lastTime = now;

  let time = "";
  let t = now;

  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }

  let rand = "";

  for (let i = 0; i < 16; i++) {
    rand += CROCKFORD[Math.floor(Math.random() * 32)];
  }

  return time + rand.slice(0, 14) + CROCKFORD[counter % 32] + CROCKFORD[(counter >> 5) % 32];
};

// ---------------------------------------------------------------------------
// Sample data

const blank = (team: Team): Character => ({
  id: ulid(),
  name: "",
  team,
  ability: "",
  firstNightInstructions: "",
  otherNightInstructions: "",
  reminders: [],
  remindersGlobal: [],
  setup: false,
  flavor: "",
});

export const newCharacter = blank;

const c = (patch: Partial<Character> & Pick<Character, "name" | "team">): Character => ({
  ...blank(patch.team),
  ...patch,
});

export const sampleScript = (): Script => {
  const lamplighter = c({
    name: "Lamplighter",
    team: "townsfolk",
    ability: "Each night, choose a player: you learn how many of their living neighbours are evil.",
    firstNightInstructions: "The Lamplighter points to a player. Show fingers equal to the number of that player's living evil neighbours.",
    otherNightInstructions: "The Lamplighter points to a player. Show fingers equal to the number of that player's living evil neighbours.",
    flavor: "Mind the dark between the lamps.",
  });
  const ferryman = c({
    name: "Ferryman",
    team: "townsfolk",
    ability: "Once per game, at night, choose a dead player: they may vote again tomorrow.",
    otherNightInstructions: "",
    reminders: ["Ferried", "No ability"],
  });
  const cartographer = c({
    name: "Cartographer",
    team: "townsfolk",
    ability: "You start knowing which 2 players sit furthest apart who are both good.",
    firstNightInstructions: "Point to the two good players who sit furthest apart.",
  });
  const tollkeeper = c({
    name: "Toll Keeper",
    team: "townsfolk",
    ability: "The first time you are nominated, the nominator must pay: they lose their vote.",
    reminders: ["Paid"],
  });
  const ghostlight = c({
    name: "Will-o'-Wisp",
    team: "outsider",
    ability: "",
    reminders: ["Lost"],
  });
  const drunkard = c({
    name: "Lamplighter",
    team: "outsider",
    ability: "You think you are a Townsfolk, but you are not.",
    setup: true,
  });
  const smuggler = c({
    name: "Smuggler",
    team: "minion",
    ability: "Each night, choose a player: they are drunk until dusk. You may choose yourself.",
    firstNightInstructions: "The Smuggler points to a player. That player is drunk.",
    otherNightInstructions: "The Smuggler points to a player. That player is drunk.",
    reminders: ["Drunk"],
  });
  const harbinger = c({
    name: "Harbinger",
    team: "minion",
    ability: "[+1 Outsider] The Demon knows which Outsiders are in play.",
    setup: true,
    firstNightInstructions: "Show the Demon the Outsider tokens in play.",
  });
  const leviathan = c({
    name: "Abyssal",
    team: "demon",
    ability: "Each night*, choose a player: they die. If you kill a Ferryman, they keep their ability.",
    otherNightInstructions: "The Abyssal points to a player. That player dies.",
    reminders: ["Dead", "Dead", "Dead"],
    remindersGlobal: ["Drowned"],
  });
  const pilgrim = c({
    name: "Pilgrim",
    team: "traveller",
    ability: "Each night, choose a Townsfolk character: you learn if it is in play.",
    otherNightInstructions: "The Pilgrim names a character. Nod or shake your head.",
  });

  const characters = [
    lamplighter,
    ferryman,
    cartographer,
    tollkeeper,
    ghostlight,
    drunkard,
    smuggler,
    harbinger,
    leviathan,
    pilgrim,
  ];

  return {
    name: "Tides of the Ferryman",
    author: "mgramigna",
    characters,
    jinxes: [
      {
        id: ulid(),
        a: ferryman.id,
        b: leviathan.id,
        reason: "If the Abyssal kills the Ferryman, the Ferryman may still choose a dead player that night.",
      },
      { id: ulid(), a: smuggler.id, b: harbinger.id, reason: "" },
    ],
    firstNight: [
      "dusk",
      smuggler.id,
      "minioninfo",
      harbinger.id,
      "demoninfo",
      cartographer.id,
      lamplighter.id,
      "dawn",
    ],
    otherNight: ["dusk", smuggler.id, leviathan.id, ferryman.id, lamplighter.id, pilgrim.id, "dawn"],
  };
};

// ---------------------------------------------------------------------------
// Actions

export type Action =
  | { type: "script"; patch: Partial<Pick<Script, "name" | "author">> }
  | { type: "add"; team: Team; id: string }
  | { type: "update"; id: string; patch: Partial<Character> }
  | { type: "delete"; id: string }
  | { type: "membership"; night: Night; id: string; member: boolean }
  | { type: "move"; night: Night; from: number; to: number }
  | { type: "addJinx"; a: string; b: string }
  | { type: "updateJinx"; id: string; reason: string }
  | { type: "deleteJinx"; id: string }
  | { type: "reset" };

const insertBeforeDawn = (list: string[], id: string): string[] => {
  const dawn = list.indexOf("dawn");
  const at = dawn === -1 ? list.length : dawn;

  return [...list.slice(0, at), id, ...list.slice(at)];
};

export const reducer = (s: Script, a: Action): Script => {
  switch (a.type) {
    case "script":
      return { ...s, ...a.patch };
    case "add": {
      const ch = { ...blank(a.team), id: a.id };

      return { ...s, characters: [...s.characters, ch] };
    }
    case "update":
      return {
        ...s,
        characters: s.characters.map((ch) => (ch.id === a.id ? { ...ch, ...a.patch } : ch)),
      };
    case "delete":
      return {
        ...s,
        characters: s.characters.filter((ch) => ch.id !== a.id),
        jinxes: s.jinxes.filter((j) => j.a !== a.id && j.b !== a.id),
        firstNight: s.firstNight.filter((id) => id !== a.id),
        otherNight: s.otherNight.filter((id) => id !== a.id),
      };
    case "membership": {
      const list = s[a.night];
      const has = list.includes(a.id);

      if (a.member === has) return s;

      return {
        ...s,
        [a.night]: a.member ? insertBeforeDawn(list, a.id) : list.filter((id) => id !== a.id),
      };
    }
    case "move": {
      const list = [...s[a.night]];
      const [item] = list.splice(a.from, 1);

      if (item === undefined) return s;

      list.splice(a.to, 0, item);

      return { ...s, [a.night]: list };
    }
    case "addJinx": {
      const exists = s.jinxes.some(
        (j) => (j.a === a.a && j.b === a.b) || (j.a === a.b && j.b === a.a),
      );

      if (exists || a.a === a.b) return s;

      return { ...s, jinxes: [...s.jinxes, { id: ulid(), a: a.a, b: a.b, reason: "" }] };
    }
    case "updateJinx":
      return {
        ...s,
        jinxes: s.jinxes.map((j) => (j.id === a.id ? { ...j, reason: a.reason } : j)),
      };
    case "deleteJinx":
      return { ...s, jinxes: s.jinxes.filter((j) => j.id !== a.id) };
    case "reset":
      return sampleScript();
  }
};

// ---------------------------------------------------------------------------
// Validation (export-blocking errors + soft nudges)

export const LIMITS = {
  name: 30,
  ability: 250,
  flavor: 500,
  instructions: 500,
  reminders: 20,
  reminderLabel: 30,
  remindersGlobal: 20,
  reminderGlobalLabel: 25,
  jinx: 500,
} as const;

export type Field =
  | "name"
  | "ability"
  | "flavor"
  | "firstNightInstructions"
  | "otherNightInstructions"
  | "reminders"
  | "remindersGlobal"
  | "jinx";

export interface Issue {
  level: "error" | "nudge";
  characterId: string | null;
  field: Field | null;
  message: string;
}

const norm = (name: string) => name.trim().toLowerCase();

export const validate = (s: Script): Issue[] => {
  const issues: Issue[] = [];
  const err = (characterId: string | null, field: Field | null, message: string) =>
    issues.push({ level: "error", characterId, field, message });

  for (const ch of s.characters) {
    if (ch.name.trim() === "") err(ch.id, "name", "Name is required");

    if (ch.name.length > LIMITS.name) err(ch.id, "name", `Name is over ${LIMITS.name} characters`);

    if (ch.name.trim() !== "") {
      const dup = s.characters.some((o) => o.id !== ch.id && norm(o.name) === norm(ch.name));

      if (dup) err(ch.id, "name", `Another Character is also named “${ch.name.trim()}”`);
    }

    if (ch.ability.trim() === "") err(ch.id, "ability", "Ability is required");

    if (ch.ability.length > LIMITS.ability)
      err(ch.id, "ability", `Ability is over ${LIMITS.ability} characters`);

    if (ch.flavor.length > LIMITS.flavor) err(ch.id, "flavor", `Flavor is over ${LIMITS.flavor} characters`);

    for (const night of ["firstNight", "otherNight"] as const) {
      const field = night === "firstNight" ? "firstNightInstructions" : "otherNightInstructions";

      if (ch[field].length > LIMITS.instructions)
        err(ch.id, field, `${NIGHT_LABEL[night]} Instructions are over ${LIMITS.instructions} characters`);

      if (s[night].includes(ch.id) && ch[field].trim() === "")
        issues.push({
          level: "nudge",
          characterId: ch.id,
          field,
          message: `In the ${NIGHT_LABEL[night]} order but has no instructions`,
        });
    }

    if (ch.reminders.length > LIMITS.reminders)
      err(ch.id, "reminders", `More than ${LIMITS.reminders} Reminder Tokens`);

    if (ch.reminders.some((r) => r.trim() === "")) err(ch.id, "reminders", "A Reminder Token is blank");

    if (ch.reminders.some((r) => r.length > LIMITS.reminderLabel))
      err(ch.id, "reminders", `A Reminder Token is over ${LIMITS.reminderLabel} characters`);

    if (ch.remindersGlobal.length > LIMITS.remindersGlobal)
      err(ch.id, "remindersGlobal", `More than ${LIMITS.remindersGlobal} Global Reminder Tokens`);

    if (ch.remindersGlobal.some((r) => r.trim() === ""))
      err(ch.id, "remindersGlobal", "A Global Reminder Token is blank");

    if (ch.remindersGlobal.some((r) => r.length > LIMITS.reminderGlobalLabel))
      err(ch.id, "remindersGlobal", `A Global Reminder Token is over ${LIMITS.reminderGlobalLabel} characters`);
  }

  for (const j of s.jinxes) {
    if (j.reason.trim() === "") {
      err(j.a, "jinx", "A Jinx has no explanation");
      err(j.b, "jinx", "A Jinx has no explanation");
    }

    if (j.reason.length > LIMITS.jinx) {
      err(j.a, "jinx", `A Jinx explanation is over ${LIMITS.jinx} characters`);
      err(j.b, "jinx", `A Jinx explanation is over ${LIMITS.jinx} characters`);
    }
  }

  return issues;
};

export const issuesFor = (issues: Issue[], id: string, field?: Field) =>
  issues.filter((i) => i.characterId === id && (field === undefined || i.field === field));

// ---------------------------------------------------------------------------
// Lookup helpers

export const byId = (s: Script, id: string) => s.characters.find((ch) => ch.id === id);

export const displayName = (ch: Character | undefined) =>
  ch === undefined ? "?" : ch.name.trim() === "" ? "Untitled" : ch.name;

export const jinxesFor = (s: Script, id: string) =>
  s.jinxes.filter((j) => j.a === id || j.b === id);

export const groupByTeam = (s: Script) =>
  AUTHORABLE_TEAMS.map((team) => ({
    team,
    characters: s.characters.filter((ch) => ch.team === team),
  }));

// ---------------------------------------------------------------------------
// JSON export (as the official app would receive it)

const GENERIC_ICON = "https://icons.alchemist.example/generic";

export const exportJson = (s: Script) => {
  const priority = (night: Night, id: string) => {
    const i = s[night].indexOf(id);

    return i === -1 ? 0 : i + 1;
  };

  return [
    {
      id: "_meta",
      name: s.name,
      author: s.author,
      firstNight: s.firstNight,
      otherNight: s.otherNight,
    },
    ...s.characters.map((ch) => {
      const owned = s.jinxes.filter((j) => (j.a < j.b ? j.a : j.b) === ch.id);

      return {
        id: ch.id,
        name: ch.name,
        team: ch.team,
        ability: ch.ability,
        image:
          ch.team === "traveller"
            ? [`${GENERIC_ICON}/traveller.png`, `${GENERIC_ICON}/traveller-good.png`, `${GENERIC_ICON}/traveller-evil.png`]
            : [`${GENERIC_ICON}/${ch.team}.png`, `${GENERIC_ICON}/${ch.team}-flipped.png`],
        ...(ch.setup ? { setup: true } : {}),
        firstNight: priority("firstNight", ch.id),
        otherNight: priority("otherNight", ch.id),
        firstNightReminder: ch.firstNightInstructions,
        otherNightReminder: ch.otherNightInstructions,
        reminders: ch.reminders,
        remindersGlobal: ch.remindersGlobal,
        ...(ch.flavor !== "" ? { flavor: ch.flavor } : {}),
        ...(owned.length > 0
          ? { jinxes: owned.map((j) => ({ id: j.a === ch.id ? j.b : j.a, reason: j.reason })) }
          : {}),
      };
    }),
  ];
};
