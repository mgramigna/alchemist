// PROTOTYPE — throwaway (issue #15: "Prototype the Script editor").
// Three structurally different Script editors, switchable via `?variant=A|B|C`
// and the floating bar at the bottom. One in-memory Script is shared by all
// variants, so edits made in one survive switching to another. Nothing persists;
// reload resets to the sample Script.

import { useEffect, useMemo, useReducer, useState } from "react";
import { exportJson, reducer, sampleScript, validate } from "./model.ts";
import { errorCount } from "./shared.tsx";
import * as A from "./VariantA.tsx";
import * as B from "./VariantB.tsx";
import * as C from "./VariantC.tsx";

const VARIANTS = [
  { key: "A", name: A.name, Component: A.VariantA },
  { key: "B", name: B.name, Component: B.VariantB },
  { key: "C", name: C.name, Component: C.VariantC },
] as const;

type Key = (typeof VARIANTS)[number]["key"];

const readKey = (): Key => {
  const v = new URLSearchParams(location.search).get("variant");

  return VARIANTS.find((x) => x.key === v)?.key ?? "A";
};

export function App() {
  const [script, dispatch] = useReducer(reducer, undefined, sampleScript);
  const issues = useMemo(() => validate(script), [script]);
  const [key, setKey] = useState<Key>(readKey);
  const current = VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
  const Variant = current.Component;

  const go = (k: Key) => {
    const url = new URL(location.href);
    url.searchParams.set("variant", k);
    history.replaceState(null, "", url);
    setKey(k);
  };

  return (
    <>
      <Variant script={script} dispatch={dispatch} issues={issues} />
      {import.meta.env.DEV && (
        <PrototypeSwitcher current={key} onGo={go} onReset={() => dispatch({ type: "reset" })} state={{ script, issues }} />
      )}
    </>
  );
}

function PrototypeSwitcher(props: {
  current: Key;
  onGo: (k: Key) => void;
  onReset: () => void;
  state: { script: Parameters<typeof exportJson>[0]; issues: ReturnType<typeof validate> };
}) {
  const [showState, setShowState] = useState(false);
  const i = VARIANTS.findIndex((v) => v.key === props.current);
  const step = (d: number) => {
    const next = VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length];

    if (next) props.onGo(next.key);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;

      if (t instanceof HTMLElement && (t.closest("input, textarea, select, [contenteditable]") !== null)) return;

      if (e.key === "ArrowLeft") step(-1);

      if (e.key === "ArrowRight") step(1);
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  });

  const v = VARIANTS[i];
  const errors = errorCount(props.state.issues);

  return (
    <>
      {showState && (
        <div className="proto-state">
          <div className="proto-state-head">
            <strong>State</strong> · {errors} export-blocking · {props.state.issues.length - errors} nudges
            <span className="spacer" />
            <button type="button" onClick={props.onReset}>
              Reset sample
            </button>
            <button type="button" onClick={() => setShowState(false)}>
              ✕
            </button>
          </div>
          <div className="proto-state-cols">
            <div>
              <h4>Validation</h4>
              <ul>
                {props.state.issues.map((x, n) => (
                  <li key={n} className={x.level}>
                    [{x.level}] {props.state.script.characters.find((c) => c.id === x.characterId)?.name || "?"} · {x.field}: {x.message}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Export JSON (derived)</h4>
              <pre>{JSON.stringify(exportJson(props.state.script), null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
      <div className="proto-bar">
        <button type="button" onClick={() => step(-1)} aria-label="Previous variant">
          ←
        </button>
        <span className="proto-label">
          {v?.key} <span className="proto-name">({v?.name})</span>
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Next variant">
          →
        </button>
        <span className="proto-sep" />
        <button type="button" className={showState ? "is-on" : ""} onClick={() => setShowState((s) => !s)}>
          {"{ }"} state
        </button>
      </div>
    </>
  );
}
