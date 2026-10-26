import { createBrowserHistory, createRouter, type RouterHistory } from "@tanstack/react-router";
import type { AtomRegistry } from "effect/reactivity";
import { routeTree } from "./routeTree.gen.ts";

export interface RouterContext {
  readonly registry: AtomRegistry.AtomRegistry;
}

export const createAppRouter = (
  registry: AtomRegistry.AtomRegistry,
  history: RouterHistory = createBrowserHistory(),
) => createRouter({ routeTree, history, context: { registry }, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }

  interface StaticDataRouteOption {
    /** Lets a page use the full width instead of the reading-width column. */
    readonly wide?: boolean;
  }
}
