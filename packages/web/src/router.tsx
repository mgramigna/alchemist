import { createBrowserHistory, createRouter, type RouterHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

export const createAppRouter = (history: RouterHistory = createBrowserHistory()) =>
  createRouter({ routeTree, history, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
