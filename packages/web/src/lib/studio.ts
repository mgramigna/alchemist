import { AUTO_FINISH, type ArtworkStyle, type StudioSetting } from "@alchemist/domain";
import type { Types } from "effect";
import { lookColor, type CutoutMode } from "./stylize.ts";

const STUDIO_SETTINGS = [
  "cutout",
  "tolerance",
  "color",
  "detail",
  "teamShades",
  "texture",
  "outline",
  "shadow",
  "shadowBlur",
  "shadowY",
  "size",
  "offsetX",
  "offsetY",
] as const satisfies ReadonlyArray<StudioSetting>;

const automaticValue = (
  style: ArtworkStyle,
  key: StudioSetting,
  mode: CutoutMode | undefined,
): ArtworkStyle[StudioSetting] => {
  switch (key) {
    case "color":
    case "detail":
      return mode === undefined ? undefined : lookColor(style.look, mode)[key];
    default:
      return AUTO_FINISH[key];
  }
};

/**
 * Sets one Studio setting, dropping it when it matches what automatic styling
 * would use, so the Customized badge only names real changes.
 */
export const withSetting = <K extends StudioSetting>(
  style: ArtworkStyle,
  key: K,
  value: NonNullable<ArtworkStyle[K]>,
  mode: CutoutMode | undefined,
): ArtworkStyle => {
  const next: Types.Mutable<ArtworkStyle> = { ...style };

  if (value === automaticValue(style, key, mode)) delete next[key];
  else next[key] = value;

  return next;
};

export const sameStyle = (a: ArtworkStyle, b: ArtworkStyle) =>
  a.look === b.look && STUDIO_SETTINGS.every((key) => a[key] === b[key]);
