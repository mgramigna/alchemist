# Third-party notices

Alchemist's original code is available under the [MIT license](LICENSE).
Third-party code, documents, fonts, artwork, and trademarks retain their own
terms. The root license does not relicense those materials or grant trademark
rights.

## Agent skills

The skills identified as `mattpocock/skills` in [skills-lock.json](skills-lock.json)
were copied or adapted from [Matt Pocock's skills](https://github.com/mattpocock/skills).
Copyright (c) 2026 Matt Pocock. Their MIT license is retained in
[.agents/skills/LICENSE](.agents/skills/LICENSE). Other locally authored skills
remain covered by the root license.

## Anti-slop lint rules

`tools/oxlint/anti-slop` was copied from
[dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at commit
`13909c9e07590f5a85d93c62712259fe14a883f7`.
Copyright (c) 2026 Dillon Mulroy. Its MIT license is retained in
[tools/oxlint/anti-slop/LICENSE](tools/oxlint/anti-slop/LICENSE), alongside the
[provenance record](tools/oxlint/anti-slop/UPSTREAM.md).
This notice also applies to the pristine snapshot in `tools/oxlint/upstream/`.

The nested ESLint Stylistic files have their own
[MIT license and copyright notices](tools/oxlint/anti-slop/vendor/eslint-stylistic/LICENSE)
and [provenance record](tools/oxlint/anti-slop/vendor/eslint-stylistic/UPSTREAM.md).
Retain both upstream licenses when redistributing these rules.

## Blood on the Clocktower

Blood on the Clocktower and associated TPI materials belong to their respective
rights holders. Alchemist is a community project and is not affiliated with or
endorsed by The Pandemonium Institute.

`packages/domain/src/schemas/botc-script.json` is copied from
[TPI's script schema](https://github.com/ThePandemoniumInstitute/botc-release/blob/f10cd02e3401af227ce406287eaae7bb99a06a42/script-schema.json)
at commit `f10cd02e3401af227ce406287eaae7bb99a06a42`, with formatting changes only.
It is excluded from Alchemist's MIT grant. Upstream documents using the schema
for validation, but no separate license granting redistribution or relicensing
was identified in the reviewed upstream materials.

Alchemist focuses on authoring and sharing homebrew Scripts and custom Characters.
The maintainer considers this distinct from the official script tool. This notice
does not determine whether Alchemist competes with an official TPI offering.

TPI's [Community Created Content Policy](https://bloodontheclocktower.com/pages/community-created-content-policy),
reviewed on 2026-10-27, addresses community projects and competing tools. It states
that it is not a license. It therefore does not establish an open-source license
for the copied schema. The schema's redistribution terms remain unconfirmed,
separately from Alchemist's intended homebrew scope. TPI lists
`butler@thepandemoniuminstitute.com` as its contact for clarification.

## Screenshot artwork

The maintainer confirmed on 2026-10-27 that the artwork shown in the README
screenshots is their own SVG work. That original artwork is covered by the root
MIT license.

The chalice visible in the README screenshots matches the built-in
SVG sample rendered by [e2e/support/artwork.ts](e2e/support/artwork.ts).
The sample's paths are defined in the repository; its blue and red variants are
produced by Alchemist's artwork styling. The sample rendering is also described
in [the artwork verification notes](docs/verification/29-character-artwork.md).
This source identification does not establish permission for unrelated artwork
that users may upload to a running instance.

## Fonts and branding

Cinzel, Libre Franklin, and Sorts Mill Goudy are installed through Fontsource.
Their SIL Open Font License notices are supplied in the corresponding packages'
`LICENSE` files. Preserve those notices when redistributing font files; the
fonts are not relicensed under Alchemist's MIT license.

The Google sign-in mark in `packages/web/public/google.svg` identifies the
authentication provider. Google's trademarks are not covered by Alchemist's
MIT license.
