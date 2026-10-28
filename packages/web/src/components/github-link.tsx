import { GithubLogoIcon } from "@phosphor-icons/react";
import { buttonVariants } from "./ui/button.tsx";

export function GitHubLink({ iconOnly = false }: { readonly iconOnly?: boolean }) {
  return (
    <a
      href="https://github.com/mgramigna/alchemist"
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({
        variant: iconOnly ? "ghost" : "outline",
        size: iconOnly ? "icon-lg" : "lg",
      })}
    >
      <GithubLogoIcon aria-hidden="true" weight="fill" />
      <span className={iconOnly ? "sr-only" : undefined}>
        View on GitHub<span className="sr-only"> (opens in a new tab)</span>
      </span>
    </a>
  );
}
