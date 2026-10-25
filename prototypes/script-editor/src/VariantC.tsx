// PROTOTYPE — throwaway. Variant C: "Ledger".
// The whole Script as one dense, inline-editable table (rows = Characters,
// expand a row for long-form fields), with both Night Orders docked underneath
// as horizontal timelines you drag along. Preview is a popover, not a pane.

import { Fragment, useState } from "react";
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
  jinxesFor,
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
  NightSheet,
  StepToken,
  TeamSelect,
  Token,
  TokenListEditor,
  useDragReorder,
  type EditorProps,
} from "./shared.tsx";

export const name = "Ledger";

export function VariantC(props: EditorProps) {
  const { script, dispatch, issues } = props;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [preview, setPreview] = useState<"sheet" | "night" | null>(null);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);

      if (n.has(id)) n.delete(id);
      else n.add(id);

      return n;
    });

  return (
    <div className="vc">
      <header className="vc-top">
        <input className="vc-title" value={script.name} onChange={(e) => dispatch({ type: "script", patch: { name: e.target.value } })} />
        <span className="muted">by</span>
        <input className="vc-author" value={script.author} onChange={(e) => dispatch({ type: "script", patch: { author: e.target.value } })} />
        <span className="spacer" />
        <button type="button" onClick={() => setPreview("sheet")}>
          Preview sheet
        </button>
        <button type="button" onClick={() => setPreview("night")}>
          Preview night sheet
        </button>
        <ExportButton issues={issues} />
      </header>

      <div className="vc-table-wrap">
        <table className="vc-table">
          <thead>
            <tr>
              <th />
              <th />
              <th>Name</th>
              <th>Team</th>
              <th className="wide">Ability</th>
              <th title="Position in First Night">1st</th>
              <th title="Position in Other Nights">Other</th>
              <th>Tokens</th>
              <th>Jinx</th>
              <th>Setup</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groupByTeam(script).map(({ team, characters }) => (
              <Fragment key={team}>
                <tr className={`vc-group team-${team}`}>
                  <td colSpan={11}>
                    {TEAM_LABEL[team]} <span className="muted small">{characters.length}</span>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        const id = ulid();
                        dispatch({ type: "add", team, id });
                        setOpen((s) => new Set(s).add(id));
                      }}
                    >
                      + add
                    </button>
                  </td>
                </tr>
                {characters.map((ch) => (
                  <Row
                    key={ch.id}
                    {...props}
                    character={ch}
                    expanded={open.has(ch.id)}
                    highlighted={hover === ch.id}
                    onToggle={() => toggle(ch.id)}
                    onHover={setHover}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="vc-dock">
        <Timeline {...props} night="firstNight" hover={hover} onHover={setHover} />
        <Timeline {...props} night="otherNight" hover={hover} onHover={setHover} />
      </footer>

      {preview && (
        <div className="vc-modal" onClick={() => setPreview(null)}>
          <div className="vc-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="tabs">
              <button type="button" className={preview === "sheet" ? "is-active" : ""} onClick={() => setPreview("sheet")}>
                Character sheet
              </button>
              <button type="button" className={preview === "night" ? "is-active" : ""} onClick={() => setPreview("night")}>
                Night sheet
              </button>
              <span className="spacer" />
              <button type="button" className="link" onClick={() => setPreview(null)}>
                close ✕
              </button>
            </div>
            {preview === "sheet" ? <CharacterSheet script={script} /> : <NightSheet script={script} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Row(
  props: EditorProps & {
    character: Character;
    expanded: boolean;
    highlighted: boolean;
    onToggle: () => void;
    onHover: (id: string | null) => void;
  },
) {
  const { script, dispatch, issues, character: ch } = props;
  const update = (patch: Partial<Character>) => dispatch({ type: "update", id: ch.id, patch });
  const errs = issuesFor(issues, ch.id).filter((i) => i.level === "error");
  const nudges = issuesFor(issues, ch.id).filter((i) => i.level === "nudge");
  const bad = (f: Parameters<typeof issuesFor>[2]) => (issuesFor(issues, ch.id, f).some((i) => i.level === "error") ? "is-bad" : "");

  const posCell = (night: Night) => {
    const i = script[night].indexOf(ch.id);
    const field = night === "firstNight" ? "firstNightInstructions" : "otherNightInstructions";
    const blank = i !== -1 && ch[field].trim() === "";

    return (
      <td className="center">
        <button
          type="button"
          className={`vc-pos ${i === -1 ? "is-off" : ""} ${blank ? "is-nudge" : ""}`}
          title={i === -1 ? `Add to ${NIGHT_LABEL[night]} (before Dawn)` : `Remove from ${NIGHT_LABEL[night]}`}
          onClick={() => dispatch({ type: "membership", night, id: ch.id, member: i === -1 })}
        >
          {i === -1 ? "—" : i + 1}
        </button>
      </td>
    );
  };

  return (
    <>
      <tr
        className={`vc-row ${props.expanded ? "is-open" : ""} ${props.highlighted ? "is-hl" : ""}`}
        onMouseEnter={() => props.onHover(ch.id)}
        onMouseLeave={() => props.onHover(null)}
      >
        <td>
          <button type="button" className="link vc-caret" onClick={props.onToggle}>
            {props.expanded ? "▾" : "▸"}
          </button>
        </td>
        <td>
          <Token team={ch.team} size={24} />
        </td>
        <td>
          <input className={`cell ${bad("name")}`} value={ch.name} placeholder="Name" onChange={(e) => update({ name: e.target.value })} />
        </td>
        <td>
          <TeamSelect value={ch.team} onChange={(team) => update({ team })} />
        </td>
        <td className="wide">
          <input className={`cell ${bad("ability")}`} value={ch.ability} placeholder="Ability" onChange={(e) => update({ ability: e.target.value })} />
        </td>
        {posCell("firstNight")}
        {posCell("otherNight")}
        <td className="center small">
          {ch.reminders.length}
          {ch.remindersGlobal.length > 0 && <span className="muted">+{ch.remindersGlobal.length}g</span>}
        </td>
        <td className="center small">{jinxesFor(script, ch.id).length || ""}</td>
        <td className="center">
          <input type="checkbox" checked={ch.setup} onChange={(e) => update({ setup: e.target.checked })} />
        </td>
        <td>
          {errs.length > 0 ? (
            <span className="badge-err" title={errs.map((e) => e.message).join("\n")} onClick={props.onToggle}>
              {errs.length}
            </span>
          ) : nudges.length > 0 ? (
            <span className="badge-nudge" title={nudges.map((e) => e.message).join("\n")}>
              !
            </span>
          ) : null}
        </td>
      </tr>
      {props.expanded && (
        <tr className="vc-detail">
          <td />
          <td colSpan={10}>
            <FieldIssues issues={issuesFor(issues, ch.id)} />
            <div className="vc-detail-grid">
              <div>
                <h4>Night Instructions</h4>
                {(["firstNight", "otherNight"] as const).map((night) => {
                  const field = night === "firstNight" ? "firstNightInstructions" : "otherNightInstructions";
                  const member = script[night].includes(ch.id);

                  return (
                    <label key={night} className={member ? "" : "is-off"}>
                      {NIGHT_LABEL[night]} {member ? "" : "(not in order)"} <Counter value={ch[field]} max={LIMITS.instructions} />
                      <textarea rows={2} value={ch[field]} onChange={(e) => update({ [field]: e.target.value })} />
                    </label>
                  );
                })}
                <label>
                  Ability (full) <Counter value={ch.ability} max={LIMITS.ability} />
                  <textarea rows={2} value={ch.ability} onChange={(e) => update({ ability: e.target.value })} />
                </label>
              </div>
              <div>
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
              </div>
              <div>
                <h4>Icon</h4>
                <IconVariants character={ch} size={36} />
                <label>
                  Flavor <Counter value={ch.flavor} max={LIMITS.flavor} />
                  <textarea rows={2} value={ch.flavor} onChange={(e) => update({ flavor: e.target.value })} />
                </label>
                <button type="button" className="link danger" onClick={() => dispatch({ type: "delete", id: ch.id })}>
                  Delete Character
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Timeline(props: EditorProps & { night: Night; hover: string | null; onHover: (id: string | null) => void }) {
  const { script, dispatch, night } = props;
  const list = script[night];
  const drag = useDragReorder((from, to) => dispatch({ type: "move", night, from, to }));

  return (
    <div className="vc-lane">
      <div className="vc-lane-label">{NIGHT_LABEL[night]}</div>
      <div className="vc-lane-track">
        {list.map((id, i) => {
          const ch = isStep(id) ? undefined : byId(script, id);
          const field = night === "firstNight" ? "firstNightInstructions" : "otherNightInstructions";
          const blank = ch !== undefined && ch[field].trim() === "";

          return (
            <div
              key={id}
              className={`vc-chip drag-item ${isStep(id) ? "is-step" : ""} ${props.hover === id ? "is-hl" : ""} ${blank ? "is-nudge" : ""}`}
              title={ch ? ch[field] || "No instructions yet" : undefined}
              onMouseEnter={() => ch && props.onHover(id)}
              onMouseLeave={() => props.onHover(null)}
              {...drag.row(i)}
              {...drag.handle(i)}
            >
              <span className="vc-chip-n">{i + 1}</span>
              {isStep(id) ? <StepToken id={id} size={18} /> : ch && <Token team={ch.team} size={18} />}
              <span>{isStep(id) ? STEP_LABEL[id] : displayName(ch)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
