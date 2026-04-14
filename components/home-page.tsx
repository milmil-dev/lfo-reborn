import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

const encyclopedia = [
	{ title: "角色資料", count: 105, href: "/docs/character" },
	{ title: "故事連載", count: 131, href: "/docs/plot/story" },
	{ title: "任務連載", count: 65, href: "/docs/plot/mission" },
	{ title: "道具", count: 6, href: "/docs/items" },
	{ title: "系統說明", count: 11, href: "/docs/system" },
	{ title: "死亡之塔", count: 3, href: "/docs/towers" },
	{ title: "兇獸檔案", count: 7, href: "/docs/beast" },
];

const events = [
	{ title: "終極拳皇盃", count: 11, href: "/docs/camp" },
	{ title: "動漫電玩節", count: 6, href: "/docs/hkacg" },
	{ title: "亞洲遊戲展", count: 7, href: "/docs/agsogs" },
];

const archive = [
	{ title: "蕃薯集中營", count: 68, href: "/docs/fanscamp" },
	{ title: "產品資訊", count: 4, href: "/docs/good" },
	{ title: "同人故事", count: 2, href: "/docs/fans" },
];

const gallery = [
	{ title: "圖片展覽", count: 5, href: "/docs/photo" },
	{ title: "音樂庭院", href: "/docs/bgm" },
	{ title: "最初的LFO", href: "/docs/start" },
];

const ease = [0.16, 1, 0.3, 1] as const;

const fadeUp = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0 },
};

const stagger = {
	visible: { transition: { staggerChildren: 0.08 } },
};

function SectionBlock({
	label,
	sub,
	items,
	delay = 0,
}: {
	label: string;
	sub: string;
	items: { title: string; count?: number; href: string }[];
	delay?: number;
}) {
	return (
		<motion.div
			initial="hidden"
			whileInView="visible"
			viewport={{ once: true, margin: "-60px" }}
			variants={{
				hidden: {},
				visible: { transition: { staggerChildren: 0.04, delayChildren: delay } },
			}}
		>
			<motion.div variants={fadeUp} className="mb-5 border-b border-fd-border pb-3">
				<h3 className="font-serif text-fd-foreground">{label}</h3>
				<p className="mt-0.5 text-xs text-fd-muted-foreground">{sub}</p>
			</motion.div>
			<div className="space-y-0.5">
				{items.map((item) => (
					<motion.div key={item.href} variants={fadeUp}>
						<Link
							to={item.href}
							className="link-primary group flex items-baseline justify-between rounded-sm py-2"
						>
							<span className="font-serif text-[0.9375rem] text-fd-muted-foreground transition-colors group-hover:text-fd-primary">
								{item.title}
							</span>
							{item.count != null && (
								<span className="ml-3 text-[0.6875rem] tabular-nums text-fd-muted-foreground/50 transition-colors group-hover:text-fd-primary/60">
									{item.count}
								</span>
							)}
						</Link>
					</motion.div>
				))}
			</div>
		</motion.div>
	);
}

export default function HomePage() {
	return (
		<main className="min-h-screen bg-fd-background">
			{/* ── Hero ── */}
			<section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6">
				{/* Ambient glow — adapts via fd-primary token opacity */}
				<div
					className="pointer-events-none absolute inset-0 dark:opacity-100 opacity-30"
					style={{
						background: [
							"radial-gradient(ellipse 50% 40% at 50% 35%, oklch(0.30 0.06 85 / 0.4) 0%, transparent 70%)",
							"radial-gradient(ellipse 80% 60% at 50% 100%, oklch(0.15 0.03 85 / 0.5) 0%, transparent 50%)",
						].join(", "),
					}}
				/>

				<motion.div
					className="relative z-10 max-w-xl text-center"
					initial="hidden"
					animate="visible"
					variants={{ visible: { transition: { staggerChildren: 0.15, delayChildren: 0.3 } } }}
				>
					{/* Era tag */}
					<motion.p
						variants={fadeUp}
						transition={{ duration: 0.8, ease }}
						className="mb-8 text-[0.6875rem] tracking-[0.5em] text-fd-muted-foreground"
					>
						2004 — 2016
					</motion.p>

					{/* Title */}
					<motion.h1
						variants={fadeUp}
						transition={{ duration: 1, ease }}
						className="font-serif leading-none"
					>
						<span className="text-[0.6875rem] font-normal tracking-[0.4em] text-fd-muted-foreground">
							歡迎來到
						</span>
						<br />
						<span className="mt-2 block text-[clamp(3.5rem,10vw,7rem)] font-bold text-fd-primary drop-shadow-[0_0_120px_oklch(0.50_0.15_85_/_0.4)]">
							LFO
						</span>
						<span className="mt-1 block text-[clamp(1.2rem,3.5vw,2rem)] tracking-[0.15em] text-fd-foreground">
							資料博物館
						</span>
					</motion.h1>

					{/* Separator */}
					<motion.div
						variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1 } }}
						transition={{ duration: 0.8, ease }}
						className="mx-auto my-10 h-px w-16 origin-center bg-fd-primary/40"
					/>

					{/* Lore — the original game opening */}
					<motion.div
						variants={stagger}
						className="space-y-4 font-serif text-sm leading-[2] text-fd-muted-foreground"
					>
						<motion.p variants={fadeUp} transition={{ duration: 0.7, ease }}>
							時空無涯，宇宙無量。
							<br />
							在那超越時空，比洪荒更遠古的時代，
							<br />
							神賜給衪的後裔——人類，
							<br />
							一種源自宇宙深處的無邊力量——
							<span className="text-fd-primary">元力</span>。
						</motion.p>

						<motion.p variants={fadeUp} transition={{ duration: 0.7, ease }}>
							憑著這股偉大的力量，人類能抵擋暴獸的圍攻，
							<br />
							渡過酷寒的冰河時代，並熬過隕石墜落所造成的赤煉日子，
							<br />
							最終變成大地的真正主宰。
						</motion.p>

						<motion.p variants={fadeUp} transition={{ duration: 0.7, ease }}>
							隨著年月的過去，安穩的生活，使人們開始倚重智慧。
							<br />
							曾經賴以為生的偉大元力，變得無用武之地，
							<br />
							從而逐漸被遺忘掉，也逐漸被掩藏埋沒。
						</motion.p>

						<motion.p variants={fadeUp} transition={{ duration: 0.7, ease }}>
							但每當世界出現真的災難之時，
							<br />
							元力始終會再次成為救世的最後力量。
						</motion.p>

						<motion.p
							variants={fadeUp}
							transition={{ duration: 0.7, ease }}
							className="text-fd-foreground/70"
						>
							新的故事、新的神話、新的英雄，在這刻又再誕生了…
						</motion.p>
					</motion.div>

					{/* Separator */}
					<motion.div
						variants={fadeUp}
						className="mx-auto my-10 flex items-center gap-3 text-fd-border"
					>
						<div className="h-px flex-1 bg-fd-border" />
						<span className="text-xs" aria-hidden="true">
							⁂
						</span>
						<div className="h-px flex-1 bg-fd-border" />
					</motion.div>

					{/* About text */}
					<motion.div
						variants={stagger}
						className="space-y-2 text-[0.8125rem] leading-relaxed text-fd-muted-foreground"
					>
						<motion.p variants={fadeUp}>
							「Little Fighter Online」——簡稱LFO
							<br />
							是一個在2004年開始營運的線上格鬥遊戲
						</motion.p>
						<motion.p variants={fadeUp}>
							在12年間經歷了「興」、「盛」、「衰」、「亡」
							<br />
							最終在2016年營運結束
						</motion.p>
						<motion.p variants={fadeUp}>
							這個網站就是要讓大家
							<br />
							再次品嚐LFO這個經典遊戲
							<br />
							以及回憶那段美好的時光
						</motion.p>
					</motion.div>

					{/* CTA */}
					<motion.div variants={fadeUp} transition={{ duration: 0.8, ease }}>
						<Link to="/docs" className="btn-primary mt-14 px-10 py-3.5 tracking-[0.2em]">
							進入百科
						</Link>
					</motion.div>
				</motion.div>

				{/* Scroll indicator */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 3, duration: 1 }}
					className="absolute bottom-10 flex flex-col items-center gap-2"
				>
					<span className="text-[0.5625rem] tracking-[0.4em] text-fd-muted-foreground/50">
						SCROLL
					</span>
					<motion.div
						animate={{ y: [0, 6, 0] }}
						transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						className="h-6 w-px bg-gradient-to-b from-fd-muted-foreground/30 to-transparent"
					/>
				</motion.div>
			</section>

			{/* ── Content Directory ── */}
			<section className="mx-auto max-w-3xl px-6 pb-32 pt-20">
				<motion.div
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true }}
					variants={fadeUp}
					transition={{ duration: 0.7, ease }}
					className="mb-20"
				>
					<p className="text-[0.6875rem] tracking-[0.4em] text-fd-muted-foreground">CONTENTS</p>
					<h2 className="mt-2 font-serif text-2xl text-fd-foreground">目錄引索</h2>
				</motion.div>

				<div className="grid gap-x-16 gap-y-14 md:grid-cols-2">
					<SectionBlock
						label="遊戲百科"
						sub="角色、劇情、道具與遊戲機制"
						items={encyclopedia}
						delay={0}
					/>
					<SectionBlock label="活動與歷史" sub="LFO的十二年活動足跡" items={events} delay={0.1} />
					<SectionBlock label="檔案庫" sub="來自官方與社群的珍貴紀錄" items={archive} delay={0} />
					<SectionBlock label="展覽廳" sub="圖像、音樂與LFO起源" items={gallery} delay={0.1} />
				</div>
			</section>

			{/* ── Colophon ── */}
			<motion.footer
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true }}
				variants={fadeUp}
				transition={{ duration: 0.8, ease }}
				className="border-t border-fd-border px-6 py-16"
			>
				<div className="mx-auto max-w-3xl text-center font-serif text-xs leading-loose text-fd-muted-foreground">
					<p>獻給所有曾在這個世界留下足跡的玩家</p>
					<p className="mt-4">
						本站基於「LFO資料博物館」之資料重建
						<br />
						原站創辦者：
						<Link to="/docs/sitemaster" className="link-primary">
							魔法使命者
						</Link>{" "}
						(BOC@HK)
					</p>
					<p className="mt-2">特別鳴謝：Chik、Stanley、Andi、Break</p>
				</div>
			</motion.footer>
		</main>
	);
}
