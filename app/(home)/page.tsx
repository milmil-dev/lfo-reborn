const categories = [
	{ title: "角色資料", description: "遊戲角色資料庫", href: "/docs/character" },
	{ title: "故事連載", description: "LFO故事連載", href: "/docs/storyindex" },
	{ title: "任務連載", description: "任務攻略連載", href: "/docs/missionindex" },
	{ title: "技能圖鑑", description: "角色技能圖鑑", href: "/docs/dex" },
	{ title: "道具圖鑑", description: "遊戲道具資料", href: "/docs/items" },
	{ title: "兇獸檔案", description: "兇獸資料", href: "/docs/beast" },
	{ title: "死亡之塔", description: "塔攻略", href: "/docs/towers" },
	{ title: "終極拳皇盃", description: "拳皇盃活動", href: "/docs/camp" },
	{ title: "最初的LFO", description: "LFO起源", href: "/docs/start" },
	{ title: "蕃薯集中營", description: "官網移植資料", href: "/docs/fanscamp" },
	{ title: "音樂庭院", description: "遊戲音樂", href: "/docs/bgm" },
	{ title: "圖片展覽", description: "特殊圖片資料", href: "/docs/photo" },
	{ title: "同人故事", description: "同人作品", href: "/docs/fans" },
	{ title: "動漫電玩節", description: "HKACG活動", href: "/docs/hkacg" },
	{ title: "亞洲遊戲展", description: "AG/SOG活動", href: "/docs/agsogs" },
	{ title: "產品資訊", description: "產品資料", href: "/docs/good" },
	{ title: "系統說明", description: "遊戲系統", href: "/docs/system" },
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
