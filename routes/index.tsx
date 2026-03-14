import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import HomePage from "@/components/home-page";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<HomeLayout {...baseOptions()}>
			<HomePage />
		</HomeLayout>
	);
}
