// PROTOTYPE — throwaway. Pieces every variant may reuse: tokens, read-only
// sheet previews, drag-to-reorder, and small field widgets. Layout is NOT shared.

import { useState, type Dispatch, type ReactNode } from "react";
import {
  AUTHORABLE_TEAMS,
  LIMITS,
  NIGHT_LABEL,
  STEP_LABEL,
  STEP_TEXT,
  TEAM_LABEL,
  byId,
  defaultAlignment,
  displayName,
  groupByTeam,
  isStep,
  jinxesFor,
  type Action,
  type Alignment,
  type Character,
  type Issue,
  type Night,
  type Script,
  type Team,
} from "./model.ts";

export interface EditorProps {
  script: Script;
  dispatch: Dispatch<Action>;
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Generic tokens

const ALIGN_COLOR: Record<Alignment, string> = {
  good: "#2f6fd6",
  evil: "#b8231b",
  none: "#b08a2e",
};

const TEAM_GLYPH: Record<Team, string> = {
  townsfolk: "✦",
  outsider: "☾",
  minion: "⚔",
  demon: "♆",
  traveller: "⚑",
  fabled: "✧",
  loric: "❖",
};

export type IconVariant = "regular" | "flipped" | "good" | "evil";

const variantAlignment = (team: Team, variant: IconVariant): Alignment => {
  if (variant === "good") return "good";

  if (variant === "evil") return "evil";

  const base = defaultAlignment(team);

  if (variant === "regular") return base;

  return base === "good" ? "evil" : base === "evil" ? "good" : "none";
};

export const iconVariants = (team: Team): IconVariant[] =>
  team === "traveller" ? ["regular", "good", "evil"] : ["regular", "flipped"];

export const VARIANT_LABEL: Record<IconVariant, string> = {
  regular: "Regular",
  flipped: "Flipped",
  good: "Good",
  evil: "Evil",
};

export function Token(props: { team: Team; size?: number; variant?: IconVariant; title?: string }) {
  const size = props.size ?? 36;
  const align = variantAlignment(props.team, props.variant ?? "regular");
  const unaligned = props.team === "traveller" && (props.variant ?? "regular") === "regular";

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="token" aria-label={props.title}>
      {unaligned ? (
        <>
          <path d="M20 2 A18 18 0 0 0 20 38 Z" fill={ALIGN_COLOR.good} />
          <path d="M20 2 A18 18 0 0 1 20 38 Z" fill={ALIGN_COLOR.evil} />
        </>
      ) : (
        <circle cx="20" cy="20" r="18" fill={ALIGN_COLOR[align]} />
      )}
      <circle cx="20" cy="20" r="14" fill="#f4ead2" />
      <text x="20" y="26" textAnchor="middle" fontSize="17" fill="#3b2f1c">
        {TEAM_GLYPH[props.team]}
      </text>
    </svg>
  );
}

export function StepToken(props: { id: string; size?: number }) {
  const size = props.size ?? 36;
  const glyph = props.id === "dusk" ? "☽" : props.id === "dawn" ? "☀" : props.id === "minioninfo" ? "M" : "D";

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="token">
      <circle cx="20" cy="20" r="18" fill="#3b2f1c" />
      <text x="20" y="26" textAnchor="middle" fontSize="16" fill="#f4ead2">
        {glyph}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Read-only previews of the PNG sheets

export function CharacterSheet(props: {
  script: Script;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  const { script } = props;

  return (
    <div className={`sheet ${props.compact === true ? "sheet-compact" : ""}`}>
      <div className="sheet-title">{script.name.trim() === "" ? "Untitled Script" : script.name}</div>
      <div className="sheet-author">by {script.author}</div>
      {groupByTeam(script).map(({ team, characters }) =>
        characters.length === 0 ? null : (
          <section key={team} className={`sheet-team team-${team}`}>
            <h3>{TEAM_LABEL[team]}</h3>
            {characters.map((ch) => (
              <div
                key={ch.id}
                id={`sheet-${ch.id}`}
                className={`sheet-row ${props.selectedId === ch.id ? "is-selected" : ""} ${props.onSelect ? "clickable" : ""}`}
                onClick={() => props.onSelect?.(ch.id)}
              >
                <Token team={ch.team} size={props.compact === true ? 28 : 40} />
                <div>
                  <div className="sheet-name">{displayName(ch)}</div>
                  <div className="sheet-ability">{ch.ability.trim() === "" ? <em className="muted">No ability yet</em> : ch.ability}</div>
                </div>
              </div>
            ))}
          </section>
        ),
      )}
      {script.jinxes.length > 0 && (
        <section className="sheet-team">
          <h3>Jinxes</h3>
          {script.jinxes.map((j) => (
            <div key={j.id} className="sheet-jinx">
              <strong>
                {displayName(byId(script, j.a))} &amp; {displayName(byId(script, j.b))}
              </strong>
              : {j.reason.trim() === "" ? <em className="muted">No explanation yet</em> : j.reason}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function NightSheet(props: {
  script: Script;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  nights?: Night[];
}) {
  const nights = props.nights ?? ["firstNight", "otherNight"];

  return (
    <div className="sheet night-sheet">
      {nights.map((night) => (
        <section key={night} className="night-col">
          <h3>{NIGHT_LABEL[night]}</h3>
          {props.script[night].map((id) => (
            <NightEntryRow
              key={id}
              script={props.script}
              night={night}
              id={id}
              selected={props.selectedId === id}
              {...(props.onSelect ? { onSelect: props.onSelect } : {})}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

export function NightEntryRow(props: {
  script: Script;
  night: Night;
  id: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
  right?: ReactNode;
}) {
  const { script, night, id } = props;

  if (isStep(id)) {
    return (
      <div className="night-row is-step">
        <StepToken id={id} size={28} />
        <div>
          <div className="sheet-name">{STEP_LABEL[id]}</div>
          <div className="sheet-ability">{STEP_TEXT[id]}</div>
        </div>
        {props.right}
      </div>
    );
  }

  const ch = byId(script, id);

  if (ch === undefined) return null;

  const text = night === "firstNight" ? ch.firstNightInstructions : ch.otherNightInstructions;

  return (
    <div
      className={`night-row ${props.selected === true ? "is-selected" : ""} ${props.onSelect ? "clickable" : ""}`}
      onClick={() => props.onSelect?.(id)}
    >
      <Token team={ch.team} size={28} />
      <div>
        <div className="sheet-name">{displayName(ch)}</div>
        <div className="sheet-ability">{text.trim() === "" ? <em className="nudge-text">No instructions yet</em> : text}</div>
      </div>
      {props.right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag to reorder (native HTML5 DnD; good enough for a prototype)

export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  // Spread `handle` on whatever starts the drag (the whole row, or just a grip
  // when the row contains text fields) and `row` on the drop target.
  const handle = (index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));

      const row = e.currentTarget.closest(".drag-item");

      if (row) e.dataTransfer.setDragImage(row, 12, 12);

      setDragging(index);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });

  const row = (index: number) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(index);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();

      if (dragging !== null && dragging !== index) onMove(dragging, index);

      setDragging(null);
      setOver(null);
    },
    "data-dragging": dragging === index ? "true" : undefined,
    "data-over": over === index && dragging !== index ? (dragging !== null && dragging < index ? "below" : "above") : undefined,
  });

  return { handle, row };
}

// ---------------------------------------------------------------------------
// Field widgets

export function Counter(props: { value: string; max: number }) {
  const over = props.value.length > props.max;

  return (
    <span className={`counter ${over ? "is-over" : ""}`}>
      {props.value.length}/{props.max}
    </span>
  );
}

export function FieldIssues(props: { issues: Issue[] }) {
  if (props.issues.length === 0) return null;

  return (
    <ul className="field-issues">
      {props.issues.map((i, n) => (
        <li key={n} className={i.level}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

export function TeamSelect(props: { value: Team; onChange: (t: Team) => void }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value as Team)}>
      {AUTHORABLE_TEAMS.map((t) => (
        <option key={t} value={t}>
          {TEAM_LABEL[t].replace(/s$/, "")}
        </option>
      ))}
    </select>
  );
}

export function TokenListEditor(props: {
  values: string[];
  maxCount: number;
  maxLabel: number;
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    props.onChange([...props.values, draft]);
    setDraft("");
  };

  return (
    <div className="token-list">
      {props.values.map((v, i) => (
        <span key={i} className={`chip ${v.trim() === "" || v.length > props.maxLabel ? "is-bad" : ""}`}>
          <input
            value={v}
            size={Math.max(4, v.length)}
            onChange={(e) => props.onChange(props.values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button type="button" className="chip-x" onClick={() => props.onChange(props.values.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      <span className="chip chip-new">
        <input
          value={draft}
          placeholder={props.placeholder}
          size={Math.max(8, draft.length)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="chip-x" onClick={add}>
          +
        </button>
      </span>
      <span className={`counter ${props.values.length > props.maxCount ? "is-over" : ""}`}>
        {props.values.length}/{props.maxCount}
      </span>
    </div>
  );
}

export function JinxEditor(props: EditorProps & { character: Character }) {
  const { script, dispatch, character } = props;
  const [partner, setPartner] = useState("");
  const jinxes = jinxesFor(script, character.id);
  const taken = new Set(jinxes.flatMap((j) => [j.a, j.b]));
  const candidates = script.characters.filter((o) => o.id !== character.id && !taken.has(o.id));

  return (
    <div className="jinx-editor">
      {jinxes.map((j) => {
        const other = byId(script, j.a === character.id ? j.b : j.a);

        return (
          <div key={j.id} className="jinx-row">
            <div className="jinx-head">
              {other && <Token team={other.team} size={22} />}
              <strong>with {displayName(other)}</strong>
              <button type="button" className="link danger" onClick={() => dispatch({ type: "deleteJinx", id: j.id })}>
                remove
              </button>
            </div>
            <textarea
              rows={2}
              value={j.reason}
              placeholder="How do these two interact?"
              className={j.reason.trim() === "" ? "is-bad" : ""}
              onChange={(e) => dispatch({ type: "updateJinx", id: j.id, reason: e.target.value })}
            />
            <Counter value={j.reason} max={LIMITS.jinx} />
          </div>
        );
      })}
      {candidates.length > 0 && (
        <div className="jinx-add">
          <select value={partner} onChange={(e) => setPartner(e.target.value)}>
            <option value="">Add a Jinx with…</option>
            {candidates.map((o) => (
              <option key={o.id} value={o.id}>
                {displayName(o)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={partner === ""}
            onClick={() => {
              dispatch({ type: "addJinx", a: character.id, b: partner });
              setPartner("");
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export function IconVariants(props: { character: Character; size?: number }) {
  return (
    <div className="icon-variants">
      {iconVariants(props.character.team).map((v) => (
        <figure key={v}>
          <Token team={props.character.team} variant={v} size={props.size ?? 48} />
          <figcaption>{VARIANT_LABEL[v]}</figcaption>
        </figure>
      ))}
      <button type="button" className="upload-stub" disabled title="Icon upload + stylize is a separate prototype">
        Upload artwork…
      </button>
    </div>
  );
}

export const errorCount = (issues: Issue[]) => issues.filter((i) => i.level === "error").length;

export function ExportButton(props: { issues: Issue[] }) {
  const n = errorCount(props.issues);

  return (
    <button type="button" className="export-btn" disabled={n > 0} title={n > 0 ? `${n} problems block export` : "Download JSON"}>
      {n > 0 ? `Export blocked · ${n}` : "Export JSON"}
    </button>
  );
}
