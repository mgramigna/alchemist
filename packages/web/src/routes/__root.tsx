import {
  createRootRouteWithContext,
  Link,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import type { RouterContext } from "../router.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      <a className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4" href="#main">
        Skip to content
      </a>
      <header className="px-6 md:px-12 lg:px-20 py-6">
        <Link className="tracking-brand no-underline" to="/" aria-label="Alchemist home">
          <span aria-hidden="true">◈</span> ALCHEMIST
        </Link>
      </header>
      <main id="main" className="flex-1 px-6 md:px-12 lg:px-20 py-12">
        <Outlet />
      </main>
      <footer className="px-6 md:px-12 lg:px-20 py-6 text-sm">
        Alchemist is not affiliated with The Pandemonium Institute.
      </footer>
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  );
}

function NotFound() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p>This link may be incorrect.</p>
      <Link to="/">Go home</Link>
    </section>
  );
}

function RouteError({ reset }: ErrorComponentProps) {
  return (
    <section className="flex flex-col gap-4" role="alert">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
