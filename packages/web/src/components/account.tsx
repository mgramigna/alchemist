import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { User } from "@alchemist/domain";
import { ArrowClockwiseIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { AsyncResult } from "effect/reactivity";
import { useRef } from "react";
import { currentAccount } from "../api.ts";
import { Avatar, AvatarFallback } from "./ui/avatar.tsx";
import { Button, buttonVariants } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

export function SignInWithGoogle({
  size = "default",
  className,
}: {
  readonly size?: "default" | "lg";
  readonly className?: string;
}) {
  return (
    <a className={cn(buttonVariants({ variant: "outline", size }), className)} href="/auth/google">
      <img src="/google.svg" alt="" width={16} height={16} />
      Sign in with Google
    </a>
  );
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function initials(displayName: string) {
  const words = displayName.trim().split(/\s+/u);
  const picked = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];

  return picked
    .map(
      (word) =>
        graphemes
          .segment(word ?? "")
          [Symbol.iterator]()
          .next().value?.segment ?? "",
    )
    .join("")
    .toLocaleUpperCase();
}

export function UserAvatar({
  user,
  size = "default",
}: {
  readonly user: User;
  readonly size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      <AvatarFallback className="bg-accent font-medium text-accent-foreground">
        {initials(user.displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

/** The header's account control: sign-in when anonymous, a menu when signed in. */
export function AccountMenu() {
  const account = useAtomValue(currentAccount);
  const refresh = useAtomRefresh(currentAccount);

  return AsyncResult.matchWithError(account, {
    onInitial: () => (
      <div aria-busy="true" aria-label="Checking your session" className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="hidden h-4 w-24 sm:block" />
      </div>
    ),
    onError: () => <AccountRetry onRetry={refresh} />,
    onDefect: () => <AccountRetry onRetry={refresh} />,
    onSuccess: ({ value }) =>
      value === null ? <SignInWithGoogle /> : <SignedInMenu key={value.id} user={value} />,
  });
}

function AccountRetry({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <ArrowClockwiseIcon />
            Retry sign-in check
          </Button>
        }
      />
      <TooltipContent>We couldn’t check whether you’re signed in.</TooltipContent>
    </Tooltip>
  );
}

function SignedInMenu({ user }: { readonly user: User }) {
  const signOut = useRef<HTMLFormElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-10 gap-2 rounded-full px-1 sm:pr-3"
              aria-label={`Account menu for ${user.displayName}`}
            />
          }
        >
          <UserAvatar user={user} />
          <span className="hidden max-w-40 truncate sm:inline">{user.displayName}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
              <span className="text-xs font-normal text-muted-foreground">Signed in as</span>
              <span className="truncate text-sm text-foreground">{user.displayName}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/account" />}>
            <UserCircleIcon />
            Account settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut.current?.requestSubmit()}>
            <SignOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={signOut} method="post" action="/auth/sign-out" hidden />
    </>
  );
}
