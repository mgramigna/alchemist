import {
  Jinx,
  JinxPair,
  JinxInvalid,
  JinxConflict,
  JinxNotFound,
  jinxPair,
  Character,
  CharacterId,
  CharacterNotFound,
  NightOrderInvalid,
  OwnedScript,
  PublicScript,
  ScriptId,
  ScriptNotFound,
  ScriptReadUnavailable,
  ScriptWriteUnavailable,
  addBeforeDawn,
  nightOrderProblem,
  type AuthoredTeam,
  type CharacterDetails,
  type Night,
  type NightOrder,
  type NightOrders,
  type ScriptDetails,
} from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import { ulid } from "./ids.ts";

export class ScriptStore extends Context.Service<
  ScriptStore,
  {
    readonly findPublic: (
      id: ScriptId,
    ) => Effect.Effect<Option.Option<PublicScript>, ScriptReadUnavailable>;
    // Also stores the default Night Orders, in the same atomic write.
    readonly insert: (
      ownerId: string,
      script: OwnedScript,
    ) => Effect.Effect<void, ScriptWriteUnavailable>;
    // Every owner query is scoped by ownerId in storage, not filtered afterwards.
    readonly listOwned: (
      ownerId: string,
    ) => Effect.Effect<ReadonlyArray<OwnedScript>, ScriptReadUnavailable>;
    readonly findOwned: (
      ownerId: string,
      id: ScriptId,
    ) => Effect.Effect<Option.Option<OwnedScript>, ScriptReadUnavailable>;
    readonly updateDetails: (
      ownerId: string,
      id: ScriptId,
      details: ScriptDetails,
      now: number,
    ) => Effect.Effect<Option.Option<OwnedScript>, ScriptWriteUnavailable>;
    // Character writes check ownership of the Script in storage and also record
    // the Script's change time. None means the Script (or Character) is not the owner's.
    readonly listCharacters: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<ReadonlyArray<Character>, ScriptReadUnavailable>;
    // Writes the Character and the Script's resulting Night Orders together.
    readonly insertCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      character: Character,
      nightOrders: NightOrders,
      now: number,
    ) => Effect.Effect<Option.Option<Character>, ScriptWriteUnavailable>;
    readonly updateCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      details: CharacterDetails,
      now: number,
    ) => Effect.Effect<Option.Option<Character>, ScriptWriteUnavailable>;
    // Removes Night Order memberships and attached Jinxes in the same atomic write.
    readonly deleteCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    readonly listJinxes: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<ReadonlyArray<Jinx>, ScriptReadUnavailable>;
    readonly insertJinx: (
      ownerId: string,
      scriptId: ScriptId,
      jinx: Jinx,
      now: number,
    ) => Effect.Effect<Option.Option<Jinx>, ScriptWriteUnavailable>;
    readonly updateJinx: (
      ownerId: string,
      scriptId: ScriptId,
      jinx: Jinx,
      now: number,
    ) => Effect.Effect<Option.Option<Jinx>, ScriptWriteUnavailable>;
    readonly deleteJinx: (
      ownerId: string,
      scriptId: ScriptId,
      pair: JinxPair,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    readonly findNightOrders: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<Option.Option<NightOrders>, ScriptReadUnavailable>;
    // Storage refuses entries naming another Script's Characters, failing the whole write.
    readonly replaceNightOrder: (
      ownerId: string,
      scriptId: ScriptId,
      night: Night,
      order: NightOrder,
      now: number,
    ) => Effect.Effect<Option.Option<NightOrders>, ScriptWriteUnavailable>;
  }
>()("alchemist/ScriptStore") {}

export class Scripts extends Context.Service<
  Scripts,
  {
    readonly readPublic: (
      id: ScriptId,
    ) => Effect.Effect<PublicScript, ScriptNotFound | ScriptReadUnavailable>;
    // Owner operations act as the signed-in User; only Authentication or an explicit test provides one.
    readonly create: () => Effect.Effect<OwnedScript, ScriptWriteUnavailable, CurrentUser>;
    readonly listOwned: () => Effect.Effect<
      ReadonlyArray<OwnedScript>,
      ScriptReadUnavailable,
      CurrentUser
    >;
    readonly readOwned: (
      id: ScriptId,
    ) => Effect.Effect<OwnedScript, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly updateDetails: (
      id: ScriptId,
      details: ScriptDetails,
    ) => Effect.Effect<OwnedScript, ScriptNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly listCharacters: (
      scriptId: ScriptId,
    ) => Effect.Effect<
      ReadonlyArray<Character>,
      ScriptNotFound | ScriptReadUnavailable,
      CurrentUser
    >;
    readonly createCharacter: (
      scriptId: ScriptId,
      team: AuthoredTeam,
      nights: ReadonlyArray<Night>,
    ) => Effect.Effect<Character, ScriptNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly updateCharacter: (
      scriptId: ScriptId,
      id: CharacterId,
      details: CharacterDetails,
    ) => Effect.Effect<Character, CharacterNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly deleteCharacter: (
      scriptId: ScriptId,
      id: CharacterId,
    ) => Effect.Effect<CharacterId, CharacterNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly listJinxes: (
      scriptId: ScriptId,
    ) => Effect.Effect<ReadonlyArray<Jinx>, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly createJinx: (
      scriptId: ScriptId,
      pair: JinxPair,
    ) => Effect.Effect<
      Jinx,
      ScriptNotFound | JinxInvalid | JinxConflict | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly updateJinx: (
      scriptId: ScriptId,
      jinx: Jinx,
    ) => Effect.Effect<Jinx, JinxNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly deleteJinx: (
      scriptId: ScriptId,
      pair: JinxPair,
    ) => Effect.Effect<JinxPair, JinxNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly readNightOrders: (
      scriptId: ScriptId,
    ) => Effect.Effect<NightOrders, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly replaceNightOrder: (
      scriptId: ScriptId,
      night: Night,
      order: NightOrder,
    ) => Effect.Effect<
      NightOrders,
      ScriptNotFound | NightOrderInvalid | ScriptWriteUnavailable,
      CurrentUser
    >;
  }
>()("alchemist/Scripts") {}

// A write that needs a fresh read reports a failed read as a failed write.
const readForWrite = <A, E, R>(effect: Effect.Effect<A, E | ScriptReadUnavailable, R>) =>
  effect.pipe(
    Effect.catchTag("ScriptReadUnavailable", () => Effect.fail(new ScriptWriteUnavailable({}))),
  );

export const ScriptsLive = Layer.effect(
  Scripts,
  Effect.gen(function* () {
    const store = yield* ScriptStore;

    return Scripts.of({
      readPublic: Effect.fn("Scripts.readPublic")(function* (id) {
        const script = yield* store.findPublic(id);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });

        // Decode the explicit representation, stripping any accidental adapter fields.
        return yield* Schema.decodeEffect(PublicScript)(script.value).pipe(
          Effect.tapCause(Effect.logError),
          Effect.mapError(() => new ScriptReadUnavailable({})),
        );
      }),
      create: Effect.fn("Scripts.create")(function* () {
        const user = yield* CurrentUser;
        const now = yield* Clock.currentTimeMillis;

        // Author Credit is copied once; later display name changes never rewrite it.
        const script = OwnedScript.make({
          id: ScriptId.make(ulid(now)),
          name: "Untitled Script",
          authorCredit: user.displayName,
          updatedAt: now,
        });

        yield* store.insert(user.id, script);

        return script;
      }),
      listOwned: Effect.fn("Scripts.listOwned")(function* () {
        const user = yield* CurrentUser;

        return yield* store.listOwned(user.id);
      }),
      readOwned: Effect.fn("Scripts.readOwned")(function* (id) {
        const user = yield* CurrentUser;
        const script = yield* store.findOwned(user.id, id);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });

        return script.value;
      }),
      updateDetails: Effect.fn("Scripts.updateDetails")(function* (id, details) {
        const user = yield* CurrentUser;

        const script = yield* store.updateDetails(
          user.id,
          id,
          { name: details.name, authorCredit: details.authorCredit },
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });

        return script.value;
      }),
      listCharacters: Effect.fn("Scripts.listCharacters")(function* (scriptId) {
        const user = yield* CurrentUser;
        const script = yield* store.findOwned(user.id, scriptId);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id: scriptId });

        return yield* store.listCharacters(user.id, scriptId);
      }),
      createCharacter: Effect.fn("Scripts.createCharacter")(function* (scriptId, team, nights) {
        const user = yield* CurrentUser;
        const now = yield* Clock.currentTimeMillis;

        // Blank drafts are valid; problems surface in the editor and block export only.
        const character = Character.make({
          id: CharacterId.make(ulid(now)),
          name: "",
          ability: "",
          team,
          firstNightInstructions: "",
          otherNightInstructions: "",
          reminders: [],
          remindersGlobal: [],
          setup: false,
          flavor: "",
        });

        const orders = yield* readForWrite(store.findNightOrders(user.id, scriptId));

        if (Option.isNone(orders)) return yield* new ScriptNotFound({ id: scriptId });

        const join = (night: Night) =>
          nights.includes(night)
            ? addBeforeDawn(orders.value[night], character.id)
            : orders.value[night];

        const saved = yield* store.insertCharacter(
          user.id,
          scriptId,
          character,
          { firstNight: join("firstNight"), otherNight: join("otherNight") },
          now,
        );

        if (Option.isNone(saved)) return yield* new ScriptNotFound({ id: scriptId });

        return saved.value;
      }),
      updateCharacter: Effect.fn("Scripts.updateCharacter")(function* (scriptId, id, details) {
        const user = yield* CurrentUser;

        const saved = yield* store.updateCharacter(
          user.id,
          scriptId,
          id,
          {
            name: details.name,
            ability: details.ability,
            team: details.team,
            firstNightInstructions: details.firstNightInstructions,
            otherNightInstructions: details.otherNightInstructions,
            reminders: details.reminders,
            remindersGlobal: details.remindersGlobal,
            setup: details.setup,
            flavor: details.flavor,
          },
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new CharacterNotFound({ id });

        return saved.value;
      }),
      deleteCharacter: Effect.fn("Scripts.deleteCharacter")(function* (scriptId, id) {
        const user = yield* CurrentUser;

        const deleted = yield* store.deleteCharacter(
          user.id,
          scriptId,
          id,
          yield* Clock.currentTimeMillis,
        );

        if (!deleted) return yield* new CharacterNotFound({ id });

        return id;
      }),
      listJinxes: Effect.fn("Scripts.listJinxes")(function* (scriptId) {
        const user = yield* CurrentUser;

        if (Option.isNone(yield* store.findOwned(user.id, scriptId)))
          return yield* new ScriptNotFound({ id: scriptId });

        return yield* store.listJinxes(user.id, scriptId);
      }),
      createJinx: Effect.fn("Scripts.createJinx")(function* (scriptId, pair) {
        const user = yield* CurrentUser;

        if (Option.isNone(yield* readForWrite(store.findOwned(user.id, scriptId))))
          return yield* new ScriptNotFound({ id: scriptId });
        const characters = yield* readForWrite(store.listCharacters(user.id, scriptId));

        if (
          pair.first === pair.second ||
          ![pair.first, pair.second].every((id) => characters.some((c) => c.id === id))
        )
          return yield* new JinxInvalid({
            message: "Choose two distinct Characters from this Script.",
          });
        const canonical = jinxPair(pair.first, pair.second);
        const jinx = { first: canonical.first, second: canonical.second, explanation: "" };

        const saved = yield* store.insertJinx(
          user.id,
          scriptId,
          jinx,
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new JinxConflict({});

        return saved.value;
      }),
      updateJinx: Effect.fn("Scripts.updateJinx")(function* (scriptId, jinx) {
        const user = yield* CurrentUser;
        const pair = jinxPair(jinx.first, jinx.second);

        const saved = yield* store.updateJinx(
          user.id,
          scriptId,
          {
            first: pair.first,
            second: pair.second,
            explanation: jinx.explanation,
          },
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new JinxNotFound({});

        return saved.value;
      }),
      deleteJinx: Effect.fn("Scripts.deleteJinx")(function* (scriptId, pair) {
        const user = yield* CurrentUser;
        const canonical = jinxPair(pair.first, pair.second);

        if (
          !(yield* store.deleteJinx(user.id, scriptId, canonical, yield* Clock.currentTimeMillis))
        )
          return yield* new JinxNotFound({});

        return canonical;
      }),
      readNightOrders: Effect.fn("Scripts.readNightOrders")(function* (scriptId) {
        const user = yield* CurrentUser;
        const orders = yield* store.findNightOrders(user.id, scriptId);

        if (Option.isNone(orders)) return yield* new ScriptNotFound({ id: scriptId });

        return orders.value;
      }),
      replaceNightOrder: Effect.fn("Scripts.replaceNightOrder")(function* (scriptId, night, order) {
        const user = yield* CurrentUser;
        const script = yield* readForWrite(store.findOwned(user.id, scriptId));

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id: scriptId });

        const characters = yield* readForWrite(store.listCharacters(user.id, scriptId));

        const problem = nightOrderProblem(
          night,
          order,
          characters.map(({ id }) => id),
        );

        if (problem !== undefined) return yield* new NightOrderInvalid({ night, message: problem });

        const saved = yield* store.replaceNightOrder(
          user.id,
          scriptId,
          night,
          order,
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new ScriptNotFound({ id: scriptId });

        return saved.value;
      }),
    });
  }),
);
