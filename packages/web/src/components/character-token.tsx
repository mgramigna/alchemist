import { characterIcons, type IconVariant, type PublicCharacter } from "@alchemist/domain";
import { cn } from "cn";

/**
 * The Character's published artwork for its current Team, otherwise its
 * generic icon. Decorative by default: the Character's name labels it.
 */
export function CharacterToken({
  character,
  variant,
  className,
}: {
  readonly character: Pick<PublicCharacter, "team" | "artwork">;
  readonly variant?: IconVariant;
  readonly className?: string;
}) {
  const icons = characterIcons(character);
  const icon = icons.find((candidate) => candidate.variant === variant) ?? icons[0];

  return (
    <img
      src={icon?.path}
      alt=""
      width={400}
      height={400}
      className={cn("size-8 shrink-0", className)}
    />
  );
}
