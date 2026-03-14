const categories = [
	{ title: "角色", description: "遊戲角色資料", href: "/docs/character" },
	{ title: "故事", description: "故事連載", href: "/docs/storyindex" },
	{ title: "任務", description: "任務攻略", href: "/docs/missionindex" },
	{ title: "道具", description: "道具資料", href: "/docs/items" },
	{ title: "圖鑑", description: "圖鑑資料", href: "/docs/dex" },
	{ title: "獸", description: "獸資料", href: "/docs/beast" },
	{ title: "塔", description: "塔攻略", href: "/docs/towers" },
	{ title: "新手", description: "新手指南", href: "/docs/start" },
	{ title: "營地", description: "營地資料", href: "/docs/camp" },
	{ title: "音樂", description: "遊戲音樂", href: "/docs/bgm" },
	{ title: "圖片", description: "遊戲圖片", href: "/docs/photo" },
	{ title: "同人", description: "同人作品", href: "/docs/fans" },
];

export default function HomePage() {
	return (
		<main className="min-h-screen">
			<section className="flex flex-col items-center justify-center px-4 py-24 text-center">
				<h1 className="font-serif text-5xl font-bold text-fd-primary md:text-7xl">LFO Wiki</h1>
				<p className="mt-4 max-w-xl text-lg text-fd-muted-foreground">
					小朋友齊打交Online遊戲百科全書
				</p>
				<a
					href="/docs"
					className="mt-8 rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground transition-colors hover:opacity-90"
				>
					進入百科
				</a>
			</section>

			<section className="mx-auto max-w-5xl px-4 pb-24">
				<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
					{categories.map((cat) => (
						<a
							key={cat.href}
							href={cat.href}
							className="rounded-lg border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-primary"
						>
							<h3 className="font-medium text-fd-card-foreground">{cat.title}</h3>
							<p className="mt-1 text-sm text-fd-muted-foreground">{cat.description}</p>
						</a>
					))}
				</div>
			</section>
		</main>
	);
}
