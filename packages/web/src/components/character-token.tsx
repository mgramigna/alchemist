import { genericIcons, type AuthoredTeam, type IconVariant } from "@alchemist/domain";
import { cn } from "cn";

/** A generic icon. Decorative by default: the Character's name labels it. */
export function CharacterToken({
  team,
  variant,
  className,
}: {
  readonly team: AuthoredTeam;
  readonly variant?: IconVariant;
  readonly className?: string;
}) {
  const icons = genericIcons(team);
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
