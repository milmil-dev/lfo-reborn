import { Trans } from "@lingui/react/macro";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link } from "@tanstack/react-router";
import { AppShell } from "@/app/shell";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: AppShell,
  notFoundComponent: () => (
    <div className="grid place-items-center gap-4 py-32 text-center">
      <p className="font-arcade text-8xl text-primary">404</p>
      <p className="text-muted-foreground">
        <Trans>找不到這一頁</Trans>
      </p>
      <Link
        to="/"
        className="rounded-full bg-foreground px-5 py-2 font-medium text-background text-sm"
      >
        <Trans>回到首頁</Trans>
      </Link>
    </div>
  ),
});
