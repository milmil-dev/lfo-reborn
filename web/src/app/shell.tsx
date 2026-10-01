import { Outlet } from "@tanstack/react-router";

/** The whole site is the game client: every route owns the full screen, no site chrome. */
export function AppShell() {
  return <Outlet />;
}
