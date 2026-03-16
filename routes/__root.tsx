import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { ImageLightbox } from "@/components/image-lightbox";
import { MusicPlayerWrapper } from "@/components/music-player-wrapper";
import "../styles/app.css";

export const Route = createRootRoute({
	component: RootComponent,
	errorComponent: RootErrorComponent,
	notFoundComponent: NotFoundComponent,
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "LFO Wiki - 小朋友齊打交Online百科" },
			{
				name: "description",
				content: "小朋友齊打交Online遊戲百科全書",
			},
			{ name: "theme-color", content: "#ffbf00" },
		],
		links: [
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@400;700&display=swap&subset=chinese-traditional",
			},
			{ rel: "manifest", href: "/manifest.json" },
			{ rel: "apple-touch-icon", href: "/icons/icon-192x192.png" },
		],
	}),
});

function RootErrorComponent() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-fd-background px-6 text-center">
			<div className="relative">
				<div
					className="pointer-events-none absolute inset-0 -z-10 opacity-20"
					style={{
						background:
							"radial-gradient(ellipse 60% 50% at 50% 40%, oklch(0.50 0.15 0 / 0.3) 0%, transparent 70%)",
					}}
				/>
				<p className="text-[0.6875rem] tracking-[0.5em] text-fd-muted-foreground/50">ERROR</p>
				<h1 className="mt-4 font-serif text-2xl text-fd-foreground">發生錯誤</h1>
				<p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
					頁面載入時發生問題，請重新整理頁面。
				</p>
				<div className="mx-auto my-8 flex items-center gap-3">
					<div className="h-px flex-1 bg-fd-border" />
					<span className="text-xs text-fd-muted-foreground/30">⁂</span>
					<div className="h-px flex-1 bg-fd-border" />
				</div>
				<div className="flex justify-center gap-3">
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="rounded-lg border border-fd-border px-5 py-2.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-muted/50 hover:text-fd-foreground"
					>
						重新整理
					</button>
					<a
						href="/"
						className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fd-primary/90"
					>
						返回首頁
					</a>
				</div>
			</div>
		</div>
	);
}

function NotFoundComponent() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-fd-background px-6 text-center">
			<div className="relative">
				<div
					className="pointer-events-none absolute inset-0 -z-10 opacity-20"
					style={{
						background:
							"radial-gradient(ellipse 60% 50% at 50% 40%, oklch(0.50 0.15 85 / 0.3) 0%, transparent 70%)",
					}}
				/>
				<p className="text-[0.6875rem] tracking-[0.5em] text-fd-muted-foreground/50">404</p>
				<h1 className="mt-4 font-serif text-2xl text-fd-foreground">找不到頁面</h1>
				<p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
					你所尋找的頁面不存在或已被移動。
				</p>
				<div className="mx-auto my-8 flex items-center gap-3">
					<div className="h-px flex-1 bg-fd-border" />
					<span className="text-xs text-fd-muted-foreground/30">⁂</span>
					<div className="h-px flex-1 bg-fd-border" />
				</div>
				<a
					href="/"
					className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fd-primary/90"
				>
					返回首頁
				</a>
			</div>
		</div>
	);
}

function RootComponent() {
	return (
		<html lang="zh-Hant" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="flex min-h-screen flex-col font-sans">
				<RootProvider theme={{ defaultTheme: "dark" }}>
					<Outlet />
					<ImageLightbox />
					<MusicPlayerWrapper />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
