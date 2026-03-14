import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export async function getRouter() {
	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: Awaited<ReturnType<typeof getRouter>>;
	}
}
