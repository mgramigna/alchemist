// PROTOTYPE — throwaway. Variant A: "Workbench".
// Three panes: navigator (Characters by Team + the two Night Orders) │ focused
// form │ always-on live preview of the PNG sheets that follows your selection.

import { useEffect, useState } from "react";
import {
  LIMITS,
  NIGHT_LABEL,
  STEP_LABEL,
  TEAM_LABEL,
  byId,
  displayName,
  groupByTeam,
  isStep,
  issuesFor,
  ulid,
  type Character,
  type Night,
} from "./model.ts";
import {
  CharacterSheet,
  Counter,
  ExportButton,
  FieldIssues,
  IconVariants,
  JinxEditor,
  NightEntryRow,
  NightSheet,
  TeamSelect,
  Token,
  TokenListEditor,
  useDragReorder,
  type EditorProps,
} from "./shared.tsx";

type Selection = { kind: "character"; id: string } | { kind: "night"; night: Night } | { kind: "script" };

export const name = "Workbench";

export function VariantA(props: EditorProps) {
  const { script, dispatch, issues } = props;
  const [sel, setSel] = useState<Selection>(() =>
    script.characters[0] ? { kind: "character", id: script.characters[0].id } : { kind: "script" },
  );
  const [previewTab, setPreviewTab] = useState<"sheet" | "night">("sheet");

  // Preview follows what you're editing.
  useEffect(() => {
    if (sel.kind === "night") setPreviewTab("night");
  }, [sel]);

  useEffect(() => {
    if (sel.kind === "character") document.getElementById(`sheet-${sel.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel, previewTab]);

  const selected = sel.kind === "character" ? byId(script, sel.id) : undefined;

  return (
    <div className="va">
      <nav className="va-nav">
        <button type="button" className={`va-nav-script ${sel.kind === "script" ? "is-active" : ""}`} onClick={() => setSel({ kind: "script" })}>
          <div className="va-script-name">{script.name}</div>
          <div className="muted small">Script details</div>
        </button>

        {groupByTeam(script).map(({ team, characters }) => (
          <div key={team} className="va-group">
            <div className="va-group-head">
              <span>{TEAM_LABEL[team]}</span>
              <button
                type="button"
                className="link"
                title={`Add ${TEAM_LABEL[team]}`}
                onClick={() => {
                  const id = ulid();
                  dispatch({ type: "add", team, id });
                  setSel({ kind: "character", id });
                }}
              >
                + add
              </button>
            </div>
            {characters.map((ch) => {
              const errs = issuesFor(issues, ch.id).filter((i) => i.level === "error").length;

              return (
                <button
                  type="button"
                  key={ch.id}
                  className={`va-nav-item ${sel.kind === "character" && sel.id === ch.id ? "is-active" : ""}`}
                  onClick={() => setSel({ kind: "character", id: ch.id })}
                >
                  <Token team={ch.team} size={22} />
                  <span className={ch.name.trim() === "" ? "muted" : ""}>{displayName(ch)}</span>
                  {errs > 0 && <span className="badge-err">{errs}</span>}
                </button>
              );
            })}
          </div>
        ))}

        <div className="va-group">
          <div className="va-group-head">
            <span>Night Order</span>
          </div>
          {(["firstNight", "otherNight"] as const).map((night) => (
            <button
              type="button"
              key={night}
              className={`va-nav-item ${sel.kind === "night" && sel.night === night ? "is-active" : ""}`}
              onClick={() => setSel({ kind: "night", night })}
            >
              <span className="va-moon">{night === "firstNight" ? "☽¹" : "☽"}</span>
              <span>{NIGHT_LABEL[night]}</span>
              <span className="muted small">{script[night].filter((id) => !isStep(id)).length}</span>
            </button>
          ))}
        </div>

        <div className="va-nav-foot">
          <ExportButton issues={issues} />
        </div>
      </nav>

      <main className="va-main">
        {sel.kind === "script" && <ScriptForm {...props} />}
        {sel.kind === "character" && selected && (
          <CharacterForm {...props} character={selected} onGoToNight={(night) => setSel({ kind: "night", night })} onDeleted={() => setSel({ kind: "script" })} />
        )}
        {sel.kind === "night" && (
          <NightOrderEditor {...props} night={sel.night} onSelect={(id) => setSel({ kind: "character", id })} />
        )}
      </main>

      <aside className="va-preview">
        <div className="tabs">
          <button type="button" className={previewTab === "sheet" ? "is-active" : ""} onClick={() => setPreviewTab("sheet")}>
            Character sheet
          </button>
          <button type="button" className={previewTab === "night" ? "is-active" : ""} onClick={() => setPreviewTab("night")}>
            Night sheet
          </button>
        </div>
        <div className="va-preview-body">
          {previewTab === "sheet" ? (
            <CharacterSheet script={script} compact selectedId={sel.kind === "character" ? sel.id : null} onSelect={(id) => setSel({ kind: "character", id })} />
          ) : (
            <NightSheet
              script={script}
              selectedId={sel.kind === "character" ? sel.id : null}
              onSelect={(id) => setSel({ kind: "character", id })}
              {...(sel.kind === "night" ? { nights: [sel.night] } : {})}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function ScriptForm(props: EditorProps) {
  const { script, dispatch, issues } = props;
  const errors = issues.filter((i) => i.level === "error");

  return (
    <div className="form">
      <h2>Script</h2>
      <label>
        Name
        <input value={script.name} onChange={(e) => dispatch({ type: "script", patch: { name: e.target.value } })} />
      </label>
      <label>
        Author
        <input value={script.author} onChange={(e) => dispatch({ type: "script", patch: { author: e.target.value } })} />
      </label>
      <h3>Before you can export</h3>
      {errors.length === 0 ? (
        <p className="muted">Nothing blocking export.</p>
      ) : (
        <ul className="field-issues">
          {errors.map((i, n) => (
            <li key={n} className="error">
              <strong>{displayName(byId(script, i.characterId ?? ""))}</strong>: {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CharacterForm(props: EditorProps & { character: Character; onGoToNight: (n: Night) => void; onDeleted: () => void }) {
  const { script, dispatch, issues, character: ch } = props;
  const update = (patch: Partial<Character>) => dispatch({ type: "update", id: ch.id, patch });

  return (
    <div className="form" key={ch.id}>
      <div className="form-head">
        <Token team={ch.team} size={44} />
        <h2>{displayName(ch)}</h2>
        <button
          type="button"
          className="link danger"
          onClick={() => {
            dispatch({ type: "delete", id: ch.id });
            props.onDeleted();
          }}
        >
          Delete Character
        </button>
      </div>

      <div className="row2">
        <label>
          Name <Counter value={ch.name} max={LIMITS.name} />
          <input value={ch.name} autoFocus={ch.name === ""} onChange={(e) => update({ name: e.target.value })} />
          <FieldIssues issues={issuesFor(issues, ch.id, "name")} />
        </label>
        <label>
          Team
          <TeamSelect value={ch.team} onChange={(team) => update({ team })} />
        </label>
      </div>

      <label>
        Ability <Counter value={ch.ability} max={LIMITS.ability} />
        <textarea rows={3} value={ch.ability} onChange={(e) => update({ ability: e.target.value })} />
        <FieldIssues issues={issuesFor(issues, ch.id, "ability")} />
      </label>

      <fieldset>
        <legend>Icon</legend>
        <IconVariants character={ch} />
      </fieldset>

      <fieldset>
        <legend>Night</legend>
        {(["firstNight", "otherNight"] as const).map((night) => {
          const field = night === "firstNight" ? "firstNightInstructions" : "otherNightInstructions";
          const list = script[night];
          const pos = list.indexOf(ch.id);
          const member = pos !== -1;
          const prev = member ? list[pos - 1] : undefined;
          const next = member ? list[pos + 1] : undefined;
          const label = (id: string | undefined) => (id === undefined ? "start" : isStep(id) ? STEP_LABEL[id] : displayName(byId(script, id)));

          return (
            <div key={night} className={`night-block ${member ? "" : "is-off"}`}>
              <label className="check">
                <input type="checkbox" checked={member} onChange={(e) => dispatch({ type: "membership", night, id: ch.id, member: e.target.checked })} />
                Acts on {NIGHT_LABEL[night]}
              </label>
              {member && (
                <div className="muted small">
                  #{pos + 1} · after <strong>{label(prev)}</strong>, before <strong>{label(next)}</strong> ·{" "}
                  <button type="button" className="link" onClick={() => props.onGoToNight(night)}>
                    reorder
                  </button>
                </div>
              )}
              <textarea
                rows={2}
                value={ch[field]}
                placeholder={member ? "Tell the Storyteller what to do…" : "Not in this night order (instructions are kept)"}
                onChange={(e) => update({ [field]: e.target.value })}
              />
              <Counter value={ch[field]} max={LIMITS.instructions} />
              <FieldIssues issues={issuesFor(issues, ch.id, field)} />
            </div>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>Reminder Tokens</legend>
        <TokenListEditor values={ch.reminders} maxCount={LIMITS.reminders} maxLabel={LIMITS.reminderLabel} placeholder="New token" onChange={(reminders) => update({ reminders })} />
        <FieldIssues issues={issuesFor(issues, ch.id, "reminders")} />
        <div className="sublabel">Global (available even when not in play)</div>
        <TokenListEditor
          values={ch.remindersGlobal}
          maxCount={LIMITS.remindersGlobal}
          maxLabel={LIMITS.reminderGlobalLabel}
          placeholder="New global token"
          onChange={(remindersGlobal) => update({ remindersGlobal })}
        />
        <FieldIssues issues={issuesFor(issues, ch.id, "remindersGlobal")} />
      </fieldset>

      <fieldset>
        <legend>Jinxes</legend>
        <JinxEditor {...props} character={ch} />
      </fieldset>

      <fieldset>
        <legend>More</legend>
        <label className="check">
          <input type="checkbox" checked={ch.setup} onChange={(e) => update({ setup: e.target.checked })} />
          Affects setup
        </label>
        <label>
          Flavor text <Counter value={ch.flavor} max={LIMITS.flavor} />
          <textarea rows={2} value={ch.flavor} onChange={(e) => update({ flavor: e.target.value })} />
        </label>
      </fieldset>
    </div>
  );
}

function NightOrderEditor(props: EditorProps & { night: Night; onSelect: (id: string) => void }) {
  const { script, dispatch, night } = props;
  const list = script[night];
  const drag = useDragReorder((from, to) => dispatch({ type: "move", night, from, to }));
  const outside = script.characters.filter((ch) => !list.includes(ch.id));

  return (
    <div className="form">
      <h2>{NIGHT_LABEL[night]}</h2>
      <p className="muted small">Drag to reorder. Standard steps move too; Characters may go after Dawn.</p>
      <div className="va-order">
        {list.map((id, i) => (
          <div key={id} className="drag-item" {...drag.row(i)} {...drag.handle(i)}>
            <span className="grip">⋮⋮</span>
            <span className="order-n">{i + 1}</span>
            <NightEntryRow
              script={script}
              night={night}
              id={id}
              onSelect={isStep(id) ? () => {} : props.onSelect}
              right={
                isStep(id) ? null : (
                  <button
                    type="button"
                    className="link danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "membership", night, id, member: false });
                    }}
                  >
                    remove
                  </button>
                )
              }
            />
          </div>
        ))}
      </div>
      <h3>Not in {NIGHT_LABEL[night]}</h3>
      <div className="va-outside">
        {outside.length === 0 && <span className="muted">Every Character is in this order.</span>}
        {outside.map((ch) => (
          <button type="button" key={ch.id} className="chip" onClick={() => dispatch({ type: "membership", night, id: ch.id, member: true })} title="Add (placed before Dawn)">
            <Token team={ch.team} size={18} /> {displayName(ch)} +
          </button>
        ))}
      </div>
    </div>
  );
}
