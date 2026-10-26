import {
  Character,
  CharacterId,
  CharacterNotFound,
  OwnedScript,
  PublicScript,
  ScriptId,
  ScriptNotFound,
  ScriptReadUnavailable,
  ScriptWriteUnavailable,
  type AuthoredTeam,
  type CharacterDetails,
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
    readonly insertCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      character: Character,
      now: number,
    ) => Effect.Effect<Option.Option<Character>, ScriptWriteUnavailable>;
    readonly updateCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      details: CharacterDetails,
      now: number,
    ) => Effect.Effect<Option.Option<Character>, ScriptWriteUnavailable>;
    // Later relationship slices must delete their rows in this same atomic write.
    readonly deleteCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
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
  }
>()("alchemist/Scripts") {}

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
      createCharacter: Effect.fn("Scripts.createCharacter")(function* (scriptId, team) {
        const user = yield* CurrentUser;
        const now = yield* Clock.currentTimeMillis;

        // Blank drafts are valid; problems surface in the editor and block export only.
        const character = Character.make({
          id: CharacterId.make(ulid(now)),
          name: "",
          ability: "",
          team,
        });

        const saved = yield* store.insertCharacter(user.id, scriptId, character, now);

        if (Option.isNone(saved)) return yield* new ScriptNotFound({ id: scriptId });

        return saved.value;
      }),
      updateCharacter: Effect.fn("Scripts.updateCharacter")(function* (scriptId, id, details) {
        const user = yield* CurrentUser;

        const saved = yield* store.updateCharacter(
          user.id,
          scriptId,
          id,
          { name: details.name, ability: details.ability, team: details.team },
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
    });
  }),
);
