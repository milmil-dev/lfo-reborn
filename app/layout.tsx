import { RootProvider } from "fumadocs-ui/provider/next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import type { ReactNode } from "react";
import "./global.css";

const notoSerif = Noto_Serif_TC({
	subsets: ["latin"],
	weight: ["400", "700"],
	variable: "--font-serif",
});

const notoSans = Noto_Sans_TC({
	subsets: ["latin"],
	weight: ["400", "500", "700"],
	variable: "--font-sans",
});

export const metadata = {
	title: "LFO Wiki - 小朋友齊打交Online百科",
	description: "小朋友齊打交Online遊戲百科全書",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="zh-Hant" className="dark" suppressHydrationWarning>
			<body
				className={`flex min-h-screen flex-col ${notoSans.variable} ${notoSerif.variable} font-sans`}
			>
				<RootProvider theme={{ enabled: false }}>{children}</RootProvider>
			</body>
		</html>
	);
}
