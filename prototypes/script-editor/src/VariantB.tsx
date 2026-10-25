// PROTOTYPE — throwaway. Variant B: "On the sheet".
// No separate preview: you type directly onto the Character sheet / Night sheet
// as they will print. Fields that don't print (reminders, jinx setup, flags)
// live in a slide-in drawer for whichever Character you clicked.

import { useState } from "react";
import {
  LIMITS,
  NIGHT_LABEL,
  STEP_LABEL,
  STEP_TEXT,
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
  Counter,
  ExportButton,
  FieldIssues,
  IconVariants,
  JinxEditor,
  StepToken,
  TeamSelect,
  Token,
  TokenListEditor,
  useDragReorder,
  type EditorProps,
} from "./shared.tsx";

export const name = "On the sheet";

export function VariantB(props: EditorProps) {
  const { script, dispatch, issues } = props;
  const [page, setPage] = useState<"sheet" | "night">("sheet");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const drawerCh = drawerId === null ? undefined : byId(script, drawerId);

  return (
    <div className="vb">
      <header className="vb-top">
        <div className="tabs">
          <button type="button" className={page === "sheet" ? "is-active" : ""} onClick={() => setPage("sheet")}>
            Character sheet
          </button>
          <button type="button" className={page === "night" ? "is-active" : ""} onClick={() => setPage("night")}>
            Night sheet
          </button>
        </div>
        <ExportButton issues={issues} />
      </header>

      <div className={`vb-stage ${drawerCh ? "has-drawer" : ""}`}>
        <div className="vb-paper sheet">
          <input
            className="vb-title"
            value={script.name}
            placeholder="Untitled Script"
            onChange={(e) => dispatch({ type: "script", patch: { name: e.target.value } })}
          />
          <div className="sheet-author">
            by{" "}
            <input className="vb-inline" value={script.author} onChange={(e) => dispatch({ type: "script", patch: { author: e.target.value } })} />
          </div>

          {page === "sheet" ? (
            <SheetPage {...props} selectedId={drawerId} onOpen={setDrawerId} />
          ) : (
            <NightPage {...props} selectedId={drawerId} onOpen={setDrawerId} />
          )}
        </div>

        {drawerCh && <Drawer {...props} character={drawerCh} onClose={() => setDrawerId(null)} />}
      </div>
    </div>
  );
}

function AutoText(props: { value: string; onChange: (v: string) => void; className: string; placeholder: string; bad?: boolean; autoFocus?: boolean }) {
  return (
    <textarea
      className={`vb-auto ${props.className} ${props.bad === true ? "is-bad" : ""}`}
      value={props.value}
      placeholder={props.placeholder}
      rows={1}
      autoFocus={props.autoFocus}
      onChange={(e) => props.onChange(e.target.value)}
      ref={(el) => {
        if (el) {
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
    />
  );
}

function SheetPage(props: EditorProps & { selectedId: string | null; onOpen: (id: string) => void }) {
  const { script, dispatch, issues } = props;

  return (
    <>
      {groupByTeam(script).map(({ team, characters }) => (
        <section key={team} className={`sheet-team team-${team}`}>
          <h3>{TEAM_LABEL[team]}</h3>
          {characters.map((ch) => {
            const errs = issuesFor(issues, ch.id).filter((i) => i.level === "error");

            return (
              <div key={ch.id} className={`sheet-row vb-row ${props.selectedId === ch.id ? "is-selected" : ""}`} onClick={() => props.onOpen(ch.id)}>
                <Token team={ch.team} size={44} />
                <div className="vb-row-body">
                  <AutoText
                    className="sheet-name"
                    value={ch.name}
                    placeholder="Name"
                    autoFocus={ch.name === ""}
                    bad={issuesFor(issues, ch.id, "name").length > 0}
                    onChange={(name) => dispatch({ type: "update", id: ch.id, patch: { name } })}
                  />
                  <AutoText
                    className="sheet-ability"
                    value={ch.ability}
                    placeholder="Write the ability…"
                    bad={issuesFor(issues, ch.id, "ability").length > 0}
                    onChange={(ability) => dispatch({ type: "update", id: ch.id, patch: { ability } })}
                  />
                </div>
                <div className="vb-row-meta">
                  {errs.length > 0 && <span className="badge-err" title={errs.map((e) => e.message).join("\n")}>{errs.length}</span>}
                  {ch.setup && <span className="pill">setup</span>}
                  {ch.reminders.length + ch.remindersGlobal.length > 0 && <span className="pill">{ch.reminders.length + ch.remindersGlobal.length} tokens</span>}
                  <span className="vb-more">details ›</span>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="vb-add"
            onClick={() => {
              const id = ulid();
              dispatch({ type: "add", team, id });
              props.onOpen(id);
            }}
          >
            + Add {TEAM_LABEL[team].replace(/s$/, "")}
          </button>
        </section>
      ))}

      <section className="sheet-team">
        <h3>Jinxes</h3>
        {script.jinxes.length === 0 && <p className="muted small">Add Jinxes from a Character’s details.</p>}
        {script.jinxes.map((j) => (
          <div key={j.id} className="sheet-jinx vb-jinx">
            <strong>
              {displayName(byId(script, j.a))} &amp; {displayName(byId(script, j.b))}:
            </strong>
            <AutoText className="" value={j.reason} placeholder="Explain the Jinx…" bad={j.reason.trim() === ""} onChange={(reason) => dispatch({ type: "updateJinx", id: j.id, reason })} />
          </div>
        ))}
      </section>
    </>
  );
}

function NightPage(props: EditorProps & { selectedId: string | null; onOpen: (id: string) => void }) {
  return (
    <div className="night-sheet vb-night">
      <NightColumn {...props} night="firstNight" />
      <NightColumn {...props} night="otherNight" />
    </div>
  );
}

function NightColumn(props: EditorProps & { night: Night; selectedId: string | null; onOpen: (id: string) => void }) {
  const { script, dispatch, night } = props;
  const list = script[night];
  const drag = useDragReorder((from, to) => dispatch({ type: "move", night, from, to }));
  const field = night === "firstNight" ? "firstNightInstructions" : "otherNightInstructions";
  const asleep = script.characters.filter((ch) => !list.includes(ch.id));

  return (
    <section className="night-col">
      <h3>{NIGHT_LABEL[night]}</h3>
      {list.map((id, i) => {
        if (isStep(id)) {
          return (
            <div key={id} className="night-row is-step drag-item" {...drag.row(i)}>
              <span className="grip" {...drag.handle(i)}>⋮⋮</span>
              <StepToken id={id} size={28} />
              <div>
                <div className="sheet-name">{STEP_LABEL[id]}</div>
                <div className="sheet-ability">{STEP_TEXT[id]}</div>
              </div>
            </div>
          );
        }

        const ch = byId(script, id);

        if (!ch) return null;

        return (
          <div key={id} className={`night-row drag-item ${props.selectedId === id ? "is-selected" : ""}`} {...drag.row(i)} onClick={() => props.onOpen(id)}>
            <span className="grip" {...drag.handle(i)}>⋮⋮</span>
            <Token team={ch.team} size={28} />
            <div className="vb-row-body">
              <div className="sheet-name">{displayName(ch)}</div>
              <AutoText
                className="sheet-ability"
                value={ch[field]}
                placeholder="No instructions yet — tell the Storyteller what to do…"
                onChange={(v) => dispatch({ type: "update", id, patch: { [field]: v } })}
              />
            </div>
            <button
              type="button"
              className="link danger vb-x"
              title="Remove from this night (instructions are kept)"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "membership", night, id, member: false });
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="vb-asleep">
        <div className="muted small">Doesn’t act this night — click to add before Dawn:</div>
        {asleep.map((ch) => (
          <button type="button" key={ch.id} className="chip" onClick={() => dispatch({ type: "membership", night, id: ch.id, member: true })}>
            <Token team={ch.team} size={16} /> {displayName(ch)}
          </button>
        ))}
      </div>
    </section>
  );
}

function Drawer(props: EditorProps & { character: Character; onClose: () => void }) {
  const { script, dispatch, issues, character: ch } = props;
  const update = (patch: Partial<Character>) => dispatch({ type: "update", id: ch.id, patch });
  const errs = issuesFor(issues, ch.id);

  return (
    <aside className="vb-drawer" key={ch.id}>
      <div className="vb-drawer-head">
        <Token team={ch.team} size={32} />
        <strong>{displayName(ch)}</strong>
        <button type="button" className="link" onClick={props.onClose}>
          close ✕
        </button>
      </div>

      <FieldIssues issues={errs} />

      <label>
        Team
        <TeamSelect value={ch.team} onChange={(team) => update({ team })} />
      </label>
      <IconVariants character={ch} size={36} />

      <h4>Night</h4>
      {(["firstNight", "otherNight"] as const).map((night) => {
        const field = night === "firstNight" ? "firstNightInstructions" : "otherNightInstructions";
        const member = script[night].includes(ch.id);

        return (
          <div key={night} className={`night-block ${member ? "" : "is-off"}`}>
            <label className="check">
              <input type="checkbox" checked={member} onChange={(e) => dispatch({ type: "membership", night, id: ch.id, member: e.target.checked })} />
              Acts on {NIGHT_LABEL[night]}
              {member && <span className="muted small"> · #{script[night].indexOf(ch.id) + 1}</span>}
            </label>
            <textarea rows={2} value={ch[field]} onChange={(e) => update({ [field]: e.target.value })} placeholder="Instructions" />
            <Counter value={ch[field]} max={LIMITS.instructions} />
          </div>
        );
      })}

      <h4>Reminder Tokens</h4>
      <TokenListEditor values={ch.reminders} maxCount={LIMITS.reminders} maxLabel={LIMITS.reminderLabel} placeholder="New token" onChange={(reminders) => update({ reminders })} />
      <div className="sublabel">Global</div>
      <TokenListEditor
        values={ch.remindersGlobal}
        maxCount={LIMITS.remindersGlobal}
        maxLabel={LIMITS.reminderGlobalLabel}
        placeholder="New global token"
        onChange={(remindersGlobal) => update({ remindersGlobal })}
      />

      <h4>Jinxes</h4>
      <JinxEditor {...props} character={ch} />

      <h4>More</h4>
      <label className="check">
        <input type="checkbox" checked={ch.setup} onChange={(e) => update({ setup: e.target.checked })} />
        Affects setup
      </label>
      <label>
        Flavor text <Counter value={ch.flavor} max={LIMITS.flavor} />
        <textarea rows={2} value={ch.flavor} onChange={(e) => update({ flavor: e.target.value })} />
      </label>

      <button
        type="button"
        className="link danger"
        onClick={() => {
          dispatch({ type: "delete", id: ch.id });
          props.onClose();
        }}
      >
        Delete Character
      </button>
    </aside>
  );
}
