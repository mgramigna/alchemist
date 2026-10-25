# Domain docs

## Before exploring

- Read root `GLOSSARY.md` for domain vocabulary.
- Read relevant ADRs in `docs/adr/`.

If these files do not exist, proceed silently. The domain-modeling skill
creates them lazily when terms or decisions are resolved.

## Layout

This repo uses a single-context layout:

- `GLOSSARY.md`: shared domain vocabulary.
- `docs/adr/`: architectural decision records.

## Use the glossary's vocabulary

Use glossary terms when naming domain concepts in issues, proposals,
hypotheses, and tests. If a needed concept is missing, reconsider whether
it belongs to the domain or note the gap for domain-modeling.

## Flag ADR conflicts

Explicitly surface any proposal that contradicts an existing ADR,
identifying the ADR and why its decision merits reconsideration.
