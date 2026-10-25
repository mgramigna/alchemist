import { RegistryContext, RegistryProvider } from "@effect/atom-react";
import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useContext, useState } from "react";
import { createRoot } from "react-dom/client";
import { createAppRouter } from "./router.tsx";
import "./style.css";

const history = createBrowserHistory();

function AppRouter() {
  const registry = useContext(RegistryContext);
  const [router] = useState(() => createAppRouter(registry, history));

  return <RouterProvider router={router} />;
}

const root = document.getElementById("root");

if (root)
  createRoot(root).render(
    <StrictMode>
      <RegistryProvider>
        <AppRouter />
      </RegistryProvider>
    </StrictMode>,
  );
