// PROTOTYPE sample Scripts. Original Custom Characters, shaped like the
// decisions in #7 (Script-owned night orders) and #8 (Character fields).

const c = (id, name, team, ability, night = {}) => ({
  id,
  name,
  team,
  ability,
  firstNightInstructions: night.first ?? null,
  otherNightInstructions: night.other ?? null,
  setup: night.setup ?? false,
});

const full = {
  name: "Brimstone & Brine",
  author: "Sample Author",
  characters: [
    c("assayer", "Assayer", "townsfolk", "Each night*, choose a player: you learn whether they are the same alignment as the last player you chose.", {
      other: "The Assayer points to a player. Nod if they share an alignment with the previous choice; shake your head if not.",
    }),
    c("cartographer", "Cartographer", "townsfolk", "You start knowing how many steps lie between the Demon and its nearest Minion.", {
      first: "Show fingers equal to the number of steps from the Demon to its nearest Minion.",
    }),
    c("lamplighter", "Lamplighter", "townsfolk", "Each night*, choose a player (not yourself): if the Demon attacks them tonight, they survive, but you might die instead.", {
      other: "The Lamplighter points to a player. Mark them with the LIT reminder.",
    }),
    c("ferryman", "Ferryman", "townsfolk", "Once per game, at night, choose a dead player: they may vote again tomorrow, and you learn their character.", {
      other: "If the Ferryman has not used their ability, they may point to a dead player. Show that player's character token.",
    }),
    c("glassblower", "Glassblower", "townsfolk", "You start knowing 2 players. Each night, you learn if either of them is drunk or poisoned.", {
      first: "Point to 2 players. Mark them with WATCHED reminders.",
      other: "Nod if either WATCHED player is drunk or poisoned.",
    }),
    c("tidewatcher", "Tidewatcher", "townsfolk", "Each day, you may publicly guess which player the Demon attacked last night. If you are correct, you learn a Minion."),
    c("herbalist", "Herbalist", "townsfolk", "Each night, choose a player: they are safe from poison tonight. If you choose the same player 2 nights in a row, you are poisoned.", {
      first: "The Herbalist points to a player. Mark them with the SAFE reminder.",
      other: "The Herbalist points to a player. Move the SAFE reminder. If unmoved, the Herbalist is poisoned.",
    }),
    c("archivist", "Archivist", "townsfolk", "You start knowing 1 good character that is not in play, and how many players are drunk or poisoned. [-1 Outsider]", {
      first: "Show 1 good character token not in play. Show fingers equal to the number of drunk or poisoned players.",
      setup: true,
    }),
    c("saltwife", "Saltwife", "townsfolk", "When you die at night, choose 2 players: you learn which of them is evil, if either.", {
      other: "If the Saltwife died tonight, wake them. They point to 2 players. Point to the evil one, or shake your head.",
    }),
    c("choirmaster", "Choirmaster", "townsfolk", "Each day, after the first execution, you may publicly choose a player: if they are a Minion, they die."),
    c("deeporacle", "Deep Oracle", "townsfolk", "Once per game, during the day, privately ask the Storyteller a yes-or-no question about the Script. They answer truthfully unless you are drunk or poisoned, in which case they may lie. If you ask about a Demon, a Minion learns you asked.", {
      other: "If the Deep Oracle asked about a Demon today, wake a Minion and point to the Deep Oracle.",
    }),
    c("watchkeeper", "Watchkeeper", "townsfolk", "Each night, you learn how many players woke tonight, not counting you.", {
      first: "",
      other: "Show fingers equal to the number of other players who woke tonight.",
    }),
    c("mendicant", "Mendicant", "townsfolk", "If you nominate and the nominee is executed, you learn whether they were the Demon."),

    c("stowaway", "Stowaway", "outsider", "You do not know you are the Stowaway. You think you are a Townsfolk, but your ability malfunctions on odd nights."),
    c("debtor", "Debtor", "outsider", "If you are executed, the player who nominated you is poisoned tonight and tomorrow day."),
    c("lighthousekeeper", "Lighthouse Keeper", "outsider", "Each night, choose a player: if they are a Minion, the Demon learns this.", {
      first: "The Lighthouse Keeper points to a player. If a Minion, wake the Demon and point to that player.",
      other: "The Lighthouse Keeper points to a player. If a Minion, wake the Demon and point to that player.",
    }),
    c("castaway", "Castaway", "outsider", "When you die, the Storyteller may make one good player believe they are the Castaway.", {
      other: "If the Castaway died today or tonight, you may wake a good player and show them the Castaway token.",
    }),

    c("tincturer", "Tincturer", "minion", "Each night, choose a player: they are poisoned tonight and tomorrow day.", {
      first: "The Tincturer points to a player. That player is poisoned.",
      other: "The Tincturer points to a player. That player is poisoned.",
    }),
    c("smuggler", "Smuggler", "minion", "Once per game, at night, choose a Townsfolk character: the Demon learns which player has it.", {
      other: "If the Smuggler has not used their ability, they may point to a Townsfolk token. Wake the Demon and point to that player.",
    }),
    c("counterfeiter", "Counterfeiter", "minion", "Good players' information about you is false. You might register as good."),
    c("brinewitch", "Brine Witch", "minion", "Each night, choose a player: if they vote tomorrow, they are drunk until dusk.", {
      first: "The Brine Witch points to a player. Mark them with the CURSED reminder.",
      other: "The Brine Witch points to a player. Move the CURSED reminder.",
    }),

    c("maw", "Maw", "demon", "Each night*, choose a player: they die. If you choose a dead player, a living neighbour of theirs dies instead.", {
      other: "The Maw points to a player. That player dies, or a living neighbour of your choice if they were already dead.",
    }),
    c("drownedking", "The Drowned King", "demon", "Each night*, choose up to 2 players: one of them dies. Minions know which player you chose second.", {
      other: "The Drowned King points to up to 2 players. One dies. Wake the Minions and point to the second choice.",
    }),

    c("pilgrim", "Pilgrim", "traveller", "Each day, you may publicly name a character: if it is in play, you learn which alignment holds it."),
    c("peddler", "Peddler", "traveller", "Each night*, choose a player: they learn your alignment.", {
      other: "The Peddler points to a player. Wake that player and show them the Peddler's alignment.",
    }),
  ],
  firstNight: [
    "dusk",
    "minioninfo",
    "demoninfo",
    "tincturer",
    "herbalist",
    "brinewitch",
    "lighthousekeeper",
    "glassblower",
    "cartographer",
    "archivist",
    "watchkeeper",
    "dawn",
  ],
  otherNight: [
    "dusk",
    "herbalist",
    "tincturer",
    "brinewitch",
    "lamplighter",
    "maw",
    "drownedking",
    "smuggler",
    "lighthousekeeper",
    "ferryman",
    "saltwife",
    "castaway",
    "assayer",
    "glassblower",
    "watchkeeper",
    "peddler",
    "dawn",
    "deeporacle",
  ],
  jinxes: [
    {
      a: "tincturer",
      b: "herbalist",
      reason: "If the Herbalist protects the player the Tincturer chooses, the Tincturer's poison lands on the Herbalist instead.",
    },
    {
      a: "lighthousekeeper",
      b: "maw",
      reason: "The Maw cannot choose the player the Lighthouse Keeper chose tonight.",
    },
  ],
};

const pick = (ids) => full.characters.filter((ch) => ids.includes(ch.id));

const teensyIds = ["cartographer", "glassblower", "herbalist", "choirmaster", "assayer", "debtor", "tincturer", "maw"];

const teensy = {
  name: "Low Tide",
  author: "Sample Author",
  characters: pick(teensyIds),
  firstNight: ["dusk", "minioninfo", "demoninfo", "tincturer", "herbalist", "glassblower", "cartographer", "dawn"],
  otherNight: ["dusk", "herbalist", "tincturer", "maw", "assayer", "glassblower", "dawn"],
  jinxes: [full.jinxes[0]],
};

export const scripts = { full, teensy };

export const standardSteps = {
  dusk: { name: "Dusk", text: "Check that all eyes are closed. Some Travellers act." },
  minioninfo: { name: "Minion Info", text: "If 7 or more players: wake all Minions. Show the THIS IS THE DEMON token and point to the Demon. Show THESE ARE YOUR MINIONS and point to the other Minions." },
  demoninfo: { name: "Demon Info", text: "If 7 or more players: wake the Demon. Show THESE ARE YOUR MINIONS and point to all Minions. Show THESE CHARACTERS ARE NOT IN PLAY and 3 good character tokens." },
  dawn: { name: "Dawn", text: "Wait a few seconds, then call for eyes open. Announce who died tonight, if anyone." },
};

export const teams = [
  { id: "townsfolk", label: "Townsfolk", alignment: "good" },
  { id: "outsider", label: "Outsiders", alignment: "good" },
  { id: "minion", label: "Minions", alignment: "evil" },
  { id: "demon", label: "Demons", alignment: "evil" },
  { id: "traveller", label: "Travellers", alignment: "none" },
];
