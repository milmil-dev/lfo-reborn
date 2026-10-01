import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip";
import { startPadBridge } from "./game/pad-bridge";
import { I18nProvider } from "./i18n";
import { routeTree } from "./routeTree.gen";
import "./global.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// a controller drives every screen, not just the fights
startPadBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
