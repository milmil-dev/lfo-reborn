import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import "../styles/app.css";

export const Route = createRootRoute({
	component: RootComponent,
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "LFO Wiki - 小朋友齊打交Online百科" },
			{
				name: "description",
				content: "小朋友齊打交Online遊戲百科全書",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@400;700&display=swap",
			},
		],
	}),
});

function RootComponent() {
	return (
		<html lang="zh-Hant" className="dark" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body
				className="flex min-h-screen flex-col font-sans"
				style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
			>
				<RootProvider theme={{ defaultTheme: "dark", forcedTheme: "dark" }}>
					<Outlet />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
