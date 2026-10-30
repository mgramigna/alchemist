import { GithubLogoIcon } from "@phosphor-icons/react";

/** A quiet source link for the footer, beside the other fine print. */
export function GitHubLink() {
  return (
    <a
      href="https://github.com/mgramigna/alchemist"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
    >
      <GithubLogoIcon aria-hidden="true" weight="fill" />
      Source on GitHub<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
