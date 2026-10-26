import {
  createRootRouteWithContext,
  Link,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { AccountMenu } from "../components/account.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { Toaster } from "../components/ui/sonner.tsx";
import type { RouterContext } from "../router.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
        href="#main"
      >
        Skip to content
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6 md:px-12">
          <Link
            className="font-heading text-lg tracking-brand no-underline"
            to="/"
            aria-label="Alchemist home"
          >
            <span aria-hidden="true" className="text-accent-foreground">
              ◈
            </span>{" "}
            ALCHEMIST
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12 md:px-12">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-sm text-muted-foreground md:px-12">
          Alchemist is not affiliated with The Pandemonium Institute.
        </div>
      </footer>
      <Toaster position="bottom-center" />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  );
}

function NotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">This link may be incorrect.</p>
      <Link className={buttonVariants({ variant: "outline" })} to="/">
        Go home
      </Link>
    </section>
  );
}

function RouteError({ reset }: ErrorComponentProps) {
  return (
    <section className="flex flex-col items-start gap-4" role="alert">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
