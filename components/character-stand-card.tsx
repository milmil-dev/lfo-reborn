"use client";

import { ResponsiveRadar } from "@nivo/radar";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { showLightbox } from "@/components/image-lightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import transformsData from "@/data/transforms.json";
import {
	type CharacterSkill,
	type HiddenSkill,
	getCharacter,
	getCharacterProfileImage,
	getCharacterSkillData,
} from "@/lib/characters";

const STAT_KEYS = ["HP", "MP", "SP", "STR", "AGI", "DEF"] as const;
const STAT_KEY_MAP: Record<string, string> = {
	hp: "HP",
	mp: "MP",
	sp: "SP",
	str: "STR",
	def: "DEF",
	agi: "AGI",
};

function toGrade(value: number): string {
	if (value >= 90) return "A";
	if (value >= 75) return "B";
	if (value >= 55) return "C";
	if (value >= 40) return "D";
	return "E";
}

function normalizeStatValue(base: string, growth: string): number {
	const b = parseFloat(base) || 0;
	const g = parseFloat(growth.replace("+", "")) || 0;
	// Normalize to 0-100 scale based on typical ranges
	// HP/MP/SP base ~200-1500, growth ~3-10
	// STR/DEF/AGI base ~5-30, growth ~0.5-3
	if (b > 100) {
		// HP/MP/SP type
		return Math.min(100, Math.round((b / 1200) * 60 + (g / 8) * 40));
	}
	// STR/DEF/AGI type
	return Math.min(100, Math.round((b / 25) * 60 + (g / 2.5) * 40));
}

interface SkillImage {
	url: string;
	name: string;
}

interface ActionGif {
	url: string;
	label: string;
}

interface Portrait {
	url: string;
	label: string;
}

interface CharacterData {
	name: string;
	slug: string;
	src: string;
	color: string;
	version: string;
	description?: string;
	birthplace?: string;
	identity?: string;
	combatStyle?: string;
	stats: { stat: string; grade: string; value: number; base?: string; growth?: string }[];
	skills: CharacterSkill[];
	weapon?: { name: string; effect?: string; durability?: string; description?: string };
	equipment?: { name: string; stats?: Record<string, string> };
	weaponImage?: string;
	equipmentImage?: string;
	skillImages?: SkillImage[];
	actionGifs?: ActionGif[];
	portraits?: Portrait[];
	dialogs?: string[];
	portraitGroups?: { label: string; portrait: string; dialogs: string[] }[];
	hasTransform?: boolean;
	relic?: string;
	relicImage?: string;
	isTransform?: boolean;
	hiddenSkills?: HiddenSkill[];
	hiddenNotes?: string[];
}

export function CharacterStandCard() {
	const [data, setData] = useState<CharacterData | null>(null);
	const [showStats, setShowStats] = useState(false);

	useEffect(() => {
		const path = window.location.pathname;
		const transformMatch = path.match(/\/docs\/character\/([^/]+)\/r$/);
		const normalMatch = path.match(/\/docs\/character\/([^/]+)$/);
		const isTransformPage = !!transformMatch;
		const slug = isTransformPage ? transformMatch[1] : normalMatch?.[1];
		if (!slug) return;
		const char = getCharacter(slug);
		if (!char) return;

		// Hide duplicate content - CharacterStandCard renders everything from JSON
		const article = document.querySelector("article");
		if (article) {
			// Hide the entire prose/body content since we render it all from data
			const proseBody =
				article.querySelector("[class*='prose']") ?? article.querySelector("[class*='body']");
			if (proseBody) (proseBody as HTMLElement).style.display = "none";
			const docsTitle = article.querySelector(":scope > h1");
			const docsDesc = article.querySelector(":scope > p");
			if (docsTitle) (docsTitle as HTMLElement).style.display = "none";
			if (docsDesc) (docsDesc as HTMLElement).style.display = "none";
		}

		// Get real stats from skills data
		const skillData = getCharacterSkillData(slug);
		const currentStats = skillData?.stats?.current;

		let stats: { stat: string; grade: string; value: number; base?: string; growth?: string }[];
		if (currentStats) {
			stats = STAT_KEYS.map((key) => {
				const k = key.toLowerCase();
				const s = currentStats[k];
				if (!s) return { stat: key, grade: "E", value: 20 };
				const value = normalizeStatValue(s.base, s.growth);
				return { stat: key, grade: toGrade(value), value, base: s.base, growth: s.growth };
			});
		} else {
			// Fallback: generate from slug hash
			const rng = seededRandom(slug);
			stats = STAT_KEYS.map((key) => {
				const value = Math.round((0.35 + rng() * 0.65) * 100);
				return { stat: key, grade: toGrade(value), value };
			});
		}

		// Load transform data if on 異轉 page
		const transform = isTransformPage
			? (
					transformsData as Record<
						string,
						{
							skillImages?: SkillImage[];
							actionGifs?: ActionGif[];
							images?: string[];
							combatStyle?: string;
							version?: string;
							description?: string;
							birthplace?: string;
							identity?: string;
							relic?: string;
							relicImage?: string;
							transformGif?: string;
							transformName?: string;
							equipmentImage?: string;
							equipment?: {
								name: string;
								stats?: Record<string, string>;
								durability?: string;
								description?: string;
							};
							weapon?: {
								name: string;
								stats?: Record<string, string>;
								durability?: string;
								description?: string;
							};
						}
					>
				)[slug]
			: undefined;

		setData({
			name: isTransformPage && transform?.transformName ? transform.transformName : char.name,
			slug,
			src:
				isTransformPage && transform?.transformGif
					? transform.transformGif
					: getCharacterProfileImage(slug),
			color: char.color,
			version: isTransformPage && transform?.version ? transform.version : char.version,
			description:
				isTransformPage && transform?.description ? transform.description : char.description,
			birthplace: isTransformPage && transform?.birthplace ? transform.birthplace : char.birthplace,
			identity: isTransformPage && transform?.identity ? transform.identity : char.identity,
			combatStyle:
				isTransformPage && transform?.combatStyle ? transform.combatStyle : char.combatStyle,
			stats,
			skills: isTransformPage ? (skillData?.transformSkills ?? []) : (skillData?.skills ?? []),
			weapon: isTransformPage ? transform?.weapon : char.weapon,
			equipment: isTransformPage ? (transform?.equipment ?? char.equipment) : char.equipment,
			weaponImage: isTransformPage ? undefined : char.weaponImage,
			equipmentImage: isTransformPage ? transform?.equipmentImage : char.equipmentImage,
			skillImages: isTransformPage ? (transform?.skillImages ?? []) : char.skillImages,
			actionGifs: isTransformPage ? (transform?.actionGifs ?? []) : char.actionGifs,
			portraits: isTransformPage ? undefined : char.portraits,
			dialogs: isTransformPage ? undefined : char.dialogs,
			portraitGroups: isTransformPage ? undefined : (char as any).portraitGroups,
			hasTransform: isTransformPage ? false : char.hasTransform,
			relic: isTransformPage ? transform?.relic : undefined,
			relicImage: isTransformPage ? transform?.relicImage : undefined,
			isTransform: isTransformPage,
			hiddenSkills: skillData?.hiddenSkills,
			hiddenNotes: skillData?.hiddenNotes,
		});
	}, []);

	if (!data) return null;

	const motionKey = `${data.slug}-${data.isTransform ? "r" : "n"}`;

	return (
		<>
		<AnimatePresence mode="wait">
			<motion.div
				key={motionKey}
				className="mb-8 space-y-6"
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -12 }}
				transition={{ duration: 0.3, ease: "easeOut" }}
			>
				{/* Top: Character image + Radar chart */}
				<div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
					{data.hasTransform && (
						<Link
							to="/docs/$"
							params={{ _splat: `character/${data.slug}/r` }}
							className="absolute left-0 top-0 z-20 h-6 w-6 overflow-hidden rounded-full shadow-md transition-transform hover:scale-110"
							title="異轉"
						>
							<img
								src="https://i.imgur.com/In66guv.png"
								alt="異轉"
								className="h-6 w-6 rounded-full object-cover"
							/>
						</Link>
					)}
					{data.isTransform && (
						<Link
							to="/docs/$"
							params={{ _splat: `character/${data.slug}` }}
							className="absolute left-0 top-0 z-20 h-6 w-6 overflow-hidden rounded-full shadow-md transition-transform hover:scale-110"
							title="按下可解除異轉"
						>
							<img
								src="https://i.imgur.com/Xznrw8N.png"
								alt="解除異轉"
								className="h-6 w-6 rounded-full object-cover"
							/>
						</Link>
					)}
					{/* Left: Character image */}
					<motion.div
						className="relative flex flex-1 flex-col items-center"
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
					>
						<div
							className="pointer-events-none absolute bottom-4 left-1/2 h-24 w-40 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
							style={{ backgroundColor: data.color }}
						/>
						<img
							src={data.src}
							alt={data.name}
							className="relative z-10 h-52 w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)] sm:h-60"
						/>
						<h2
							className="mt-1 text-center text-2xl font-black uppercase tracking-[0.15em] sm:text-3xl"
							style={{
								color: data.color,
								textShadow: `0 0 24px ${data.color}50, 0 0 48px ${data.color}20`,
								WebkitTextStroke: `0.5px ${data.color}80`,
							}}
						>
							{data.name}
						</h2>
					</motion.div>

					{/* Right: Radar chart with grade labels */}
					{!data.isTransform && (
						<motion.div
							className="flex shrink-0 flex-col items-center gap-3"
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.4, ease: "easeOut", delay: 0.25 }}
						>
							<div className="h-56 w-64">
								<ResponsiveRadar
									data={data.stats}
									keys={["value"]}
									indexBy="stat"
									maxValue={100}
									margin={{ top: 28, right: 48, bottom: 28, left: 48 }}
									gridLevels={5}
									gridShape="linear"
									borderColor={data.color}
									borderWidth={2}
									gridLabelOffset={16}
									dotSize={8}
									dotColor={data.color}
									dotBorderWidth={0}
									colors={[data.color]}
									fillOpacity={0.3}
									blendMode="normal"
									animate={true}
									motionConfig="gentle"
									theme={{
										text: { fontSize: 11, fontWeight: 700, fill: "currentColor" },
										grid: { line: { stroke: "currentColor", strokeOpacity: 0.1 } },
									}}
									sliceTooltip={({ index }) => {
										const statItem = data.stats.find((s) => s.stat === index);
										return (
											<div
												style={{
													background: "var(--color-fd-popover, #1a1a2e)",
													color: "var(--color-fd-popover-foreground, #fff)",
													borderRadius: 8,
													boxShadow: `0 4px 20px ${data.color}30`,
													border: `1px solid ${data.color}40`,
													padding: "6px 12px",
													fontSize: 13,
												}}
											>
												<strong>{index}</strong>
												{statItem?.base && (
													<span style={{ marginLeft: 8 }}>
														<span style={{ fontWeight: 900 }}>{statItem.base}</span>
														<span
															style={{
																marginLeft: 4,
																fontWeight: 700,
																color: statItem.growth?.includes("+")
																	? "#22c55e"
																	: statItem.growth?.includes("-")
																		? "#ef4444"
																		: "inherit",
															}}
														>
															{statItem.growth}
														</span>
													</span>
												)}
											</div>
										);
									}}
								/>
							</div>

							<div className="flex items-center gap-3">
								{data.stats.map((s) => (
									<div key={s.stat} className="flex flex-col items-center">
										<span className="text-[10px] font-bold opacity-50">{s.stat}</span>
										<span
											className="text-lg font-black leading-tight"
											style={{ color: data.color }}
										>
											{s.grade}
										</span>
									</div>
								))}
								<button
									type="button"
									className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-fd-border/50 bg-fd-card/80 text-fd-muted-foreground backdrop-blur-xl transition-all hover:border-fd-border hover:text-fd-foreground"
									title="查看詳細能力值"
									onClick={() => setShowStats(true)}
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-6"/></svg>
								</button>
							</div>
						</motion.div>
					)}
				</div>

				{/* 角色簡介 + Profile Info */}
				{(data.description || data.birthplace || data.identity || data.combatStyle) && (
					<div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card">
						{/* Profile tags row */}
						{(data.birthplace || data.identity || data.combatStyle) && (
							<div className="flex flex-wrap items-center gap-2 border-b border-fd-border px-4 py-3">
								{data.birthplace && (
									<span className="flex items-center gap-1.5 rounded-full bg-fd-muted px-2.5 py-0.5 text-[11px]">
										<span className="text-fd-muted-foreground">出生地</span>
										<span className="font-bold">{data.birthplace}</span>
									</span>
								)}
								{data.identity && (
									<span className="flex items-center gap-1.5 rounded-full bg-fd-muted px-2.5 py-0.5 text-[11px]">
										<span className="text-fd-muted-foreground">身份</span>
										<span className="font-bold">{data.identity}</span>
									</span>
								)}
								{data.combatStyle && (
									<span className="flex items-center gap-1.5 rounded-full bg-fd-muted px-2.5 py-0.5 text-[11px]">
										<span className="text-fd-muted-foreground">戰鬥方式</span>
										<span className="font-bold">{data.combatStyle}</span>
									</span>
								)}
								<span className="flex items-center gap-1.5 rounded-full bg-fd-muted px-2.5 py-0.5 text-[11px]">
									<span className="text-fd-muted-foreground">實裝版本</span>
									<span className="font-bold">{data.version}</span>
								</span>
							</div>
						)}
						{/* Description */}
						{data.description && (
							<div className="px-4 py-3">
								<p className="text-sm leading-relaxed text-fd-foreground/90">{data.description}</p>
							</div>
						)}
						{data.relic && (
							<div className="flex items-center gap-3 border-t border-fd-border px-4 py-3">
								{data.relicImage && (
									<img
										src={data.relicImage}
										alt={data.relic}
										className="h-24 w-auto rounded-lg object-contain"
									/>
								)}
								<div>
									<span className="text-[10px] font-bold uppercase tracking-widest text-fd-muted-foreground">
										異轉信物
									</span>
									<p className="text-sm font-bold" style={{ color: data.color }}>
										{data.relic}
									</p>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Weapon & Equipment */}
				{(data.weapon || data.equipment) && (
					<div>
						<h2 id="weapon-equipment" className="mb-3 text-lg font-bold">
							角色專用武器 / 裝備
						</h2>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{data.weapon && (
								<div className="overflow-hidden rounded-xl border border-fd-border">
									<div className="flex gap-4 p-4">
										{data.weaponImage && (
											<div className="flex shrink-0 items-center justify-center rounded-lg bg-fd-muted/50 p-2">
												<img
													src={data.weaponImage}
													alt={data.weapon.name}
													className="h-20 w-auto rounded-lg object-contain drop-shadow-md"
													loading="lazy"
												/>
											</div>
										)}
										<div className="min-w-0 flex-1">
											<div className="mb-1 flex items-center gap-2">
												<span className="text-[10px] font-bold uppercase tracking-widest text-fd-muted-foreground">
													武器
												</span>
											</div>
											<p className="text-base font-black text-fd-foreground">
												{data.weapon.name}
											</p>
											{data.weapon.description && (
												<p className="mt-1 text-xs leading-relaxed text-fd-foreground/70">
													{data.weapon.description}
												</p>
											)}
											<div className="mt-2 flex flex-wrap gap-1.5">
												{data.weapon.effect && (
													<span className="inline-flex items-center gap-1 rounded-md bg-fd-muted px-2 py-0.5 text-[11px]">
														<span className="text-fd-muted-foreground">特效</span>
														<span className="font-bold text-fd-foreground">
															{data.weapon.effect}
														</span>
													</span>
												)}
												{data.weapon.durability && (
													<span className="inline-flex items-center gap-1 rounded-md bg-fd-muted px-2 py-0.5 text-[11px]">
														<span className="text-fd-muted-foreground">耐久</span>
														<span className="font-bold">{data.weapon.durability}</span>
													</span>
												)}
											</div>
										</div>
									</div>
								</div>
							)}
							{data.equipment && (
								<div className="overflow-hidden rounded-xl border border-fd-border">
									<div className="flex gap-4 p-4">
										{data.equipmentImage && (
											<div className="flex shrink-0 items-center justify-center rounded-lg bg-fd-muted/50 p-2">
												<img
													src={data.equipmentImage}
													alt={data.equipment.name}
													className="h-20 w-auto rounded-lg object-contain drop-shadow-md"
													loading="lazy"
												/>
											</div>
										)}
										<div className="min-w-0 flex-1">
											<div className="mb-1 flex items-center gap-2">
												<span className="text-[10px] font-bold uppercase tracking-widest text-fd-muted-foreground">
													裝備
												</span>
											</div>
											<p className="text-base font-black text-fd-foreground">
												{data.equipment.name}
											</p>
											{data.equipment.stats && (
												<div className="mt-2 flex flex-wrap gap-1.5">
													{Object.entries(data.equipment.stats).map(([key, val]) => (
														<span
															key={key}
															className="inline-flex items-center gap-1 rounded-md bg-fd-muted px-2 py-0.5 text-[11px]"
														>
															<span className="text-fd-muted-foreground">
																{STAT_KEY_MAP[key] ?? key}
															</span>
															<span
																className={`font-bold font-mono ${val.includes("+") || val.includes("(+") ? "text-green-500" : val.includes("-") ? "text-red-500" : ""}`}
															>
																{val}
															</span>
														</span>
													))}
												</div>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Skills, Actions & Gallery Panel */}
				<SkillsPanel
					skills={data.skills}
					skillImages={data.skillImages ?? []}
					actionGifs={data.actionGifs ?? []}
					hiddenSkills={data.hiddenSkills ?? []}
					hiddenNotes={data.hiddenNotes ?? []}
					color={data.color}
				/>

				{/* Portraits & Dialogs — Grouped Tabs */}
				{data.portraitGroups && data.portraitGroups.length > 0 && (
					<div>
						<h2 id="portraits" className="mb-3 text-lg font-bold">
							角色型像及對話圖
						</h2>
						<Tabs defaultValue={data.portraitGroups[0].label} className="overflow-hidden rounded-2xl border border-fd-border/50 bg-fd-card/80 backdrop-blur-xl">
							<TabsList className="w-full justify-start gap-0 rounded-none border-b border-fd-border/30 bg-transparent px-2">
								{data.portraitGroups.map((g) => (
									<TabsTrigger
										key={g.label}
										value={g.label}
										className="rounded-none border-b-2 border-transparent text-xs data-[state=active]:border-fd-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
									>
										{g.label}
									</TabsTrigger>
								))}
							</TabsList>
							{data.portraitGroups.map((g) => {
								const allImages = [
									{ src: g.portrait, alt: g.label },
									...g.dialogs.map((d) => ({ src: d, alt: g.label })),
								];
								return (
									<TabsContent key={g.label} value={g.label} className="p-3">
										<div className="flex gap-6">
											{/* Portrait */}
											<button
												type="button"
												className="group shrink-0 overflow-hidden rounded-xl transition-transform hover:scale-105"
												onClick={() => showLightbox(allImages, 0)}
											>
												<img
													src={g.portrait}
													alt={g.label}
													className="h-32 w-auto cursor-zoom-in rounded-xl object-contain"
													loading="lazy"
												/>
											</button>
											{/* Dialog images */}
											{g.dialogs.length > 0 && (
												<div className="flex flex-wrap gap-1.5">
													{g.dialogs.map((url, idx) => (
														<button
															type="button"
															key={url}
															className="overflow-hidden rounded-lg transition-transform hover:scale-105"
															onClick={() => showLightbox(allImages, idx + 1)}
														>
															<img
																src={url}
																alt={g.label}
																className="h-20 w-auto cursor-zoom-in rounded-lg object-cover sm:h-24"
																loading="lazy"
															/>
														</button>
													))}
												</div>
											)}
										</div>
									</TabsContent>
								);
							})}
						</Tabs>
					</div>
				)}

				</motion.div>
		</AnimatePresence>

		{/* Stats Dialog */}
		{data && (
			<Dialog open={showStats} onOpenChange={setShowStats}>
				<DialogContent className="max-h-[80vh] overflow-auto rounded-2xl border-fd-border/50 bg-fd-card backdrop-blur-xl">
					<DialogHeader>
						<DialogTitle>詳細能力值</DialogTitle>
					</DialogHeader>
					<RawStatsTable slug={data.slug} color={data.color} />
				</DialogContent>
			</Dialog>
		)}
		</>
	);
}

function SkillsPanel({
	skills,
	skillImages,
	actionGifs,
	hiddenSkills,
	hiddenNotes,
	color,
}: {
	skills: CharacterSkill[];
	skillImages: SkillImage[];
	actionGifs: ActionGif[];
	hiddenSkills: HiddenSkill[];
	hiddenNotes: string[];
	color: string;
}) {
	const hasSkills = skills.length > 0;
	const hasActions = actionGifs.length > 0;
	const hasHidden = hiddenSkills.length > 0;

	if (!hasSkills && !hasActions && !hasHidden) return null;

	const skillImageMap = new Map(skillImages.map((si) => [si.name, si.url]));

	return (
		<div className="space-y-6">
			{/* Skills Card Grid */}
			{hasSkills && (
				<div>
					<h2 id="skills" className="mb-3 text-lg font-bold">招式技能</h2>
					<motion.div
						className="flex flex-wrap gap-2 [&>*]:w-full [&>*]:sm:w-[calc(50%-0.25rem)]"
						initial="hidden"
						animate="visible"
						variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
					>
						{skills.map((skill) => (
							<SkillCard
								key={skill.name}
								skill={skill}
								skillImage={skillImageMap.get(skill.name)}
								color={color}
								onSelect={() => {
									const lightboxImages = skills
										.map((s) => {
											const img = s.gif ?? skillImageMap.get(s.name);
											return img ? { src: img, alt: s.name } : null;
										})
										.filter(Boolean) as { src: string; alt: string }[];
									if (lightboxImages.length > 0) {
										const currentIdx = lightboxImages.findIndex((img) => img.alt === skill.name);
										showLightbox(lightboxImages, Math.max(0, currentIdx));
									}
								}}
							/>
						))}
					</motion.div>
				</div>
			)}

			{/* Action GIFs — same card style as skills */}
			{hasActions && (
				<div>
					<h2 id="actions" className="mb-3 text-lg font-bold">
						角色基本動作
					</h2>
					<div className="flex flex-wrap gap-2 [&>*]:w-full [&>*]:sm:w-[calc(50%-0.25rem)]">
						{actionGifs.map((ag) => (
							<div
								key={ag.label}
								className="group overflow-hidden rounded-2xl border border-fd-border/50 bg-fd-card/80 shadow-md shadow-black/10 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-fd-border hover:shadow-xl dark:shadow-black/30"
							>
								<div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-fd-muted/20">
									<img
										src={ag.url}
										alt={ag.label}
										className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
										loading="lazy"
									/>
								</div>
								<div className="px-3 pb-3 pt-2.5">
									<span className="text-sm font-bold text-fd-foreground">{ag.label}</span>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Hidden Skills Section */}
			{hasHidden && (
				<div>
					<div className="mb-3 flex items-center gap-2">
						<h2 id="hidden-skills" className="text-lg font-bold">隱藏動作/技能資料</h2>
						{hiddenNotes.length > 0 && (
							<TooltipProvider delayDuration={200}>
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											className="flex h-6 w-6 items-center justify-center rounded-full text-fd-muted-foreground transition-colors hover:text-fd-foreground"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
										</button>
									</TooltipTrigger>
									<TooltipContent side="bottom" className="max-w-sm">
										<p className="mb-1.5 text-xs font-bold">附加說明</p>
										<ul className="list-disc space-y-1 pl-3.5">
											{hiddenNotes.map((note) => (
												<li key={note} className="text-xs leading-relaxed">
													<HighlightedText text={note} />
												</li>
											))}
										</ul>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						)}
					</div>
					<div className="flex flex-wrap gap-2 [&>*]:w-full [&>*]:sm:w-[calc(50%-0.25rem)]">
						{hiddenSkills.map((hs) => (
							<button
								type="button"
								key={`${hs.category}-${hs.name}`}
								className="group overflow-hidden rounded-2xl border border-fd-border/50 bg-fd-card/80 text-left shadow-md shadow-black/10 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-fd-border hover:shadow-xl dark:shadow-black/30"
								onClick={() => {
									if (hs.gif) {
										const allGifs = hiddenSkills
											.filter((h) => h.gif)
											.map((h) => ({ src: h.gif!, alt: h.name }));
										const idx = allGifs.findIndex((g) => g.alt === hs.name);
										showLightbox(allGifs, Math.max(0, idx));
									}
								}}
							>
								{hs.gif && (
									<div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-fd-muted/20">
										<img
											src={hs.gif}
											alt={hs.name}
											className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
											loading="lazy"
										/>
									</div>
								)}
								<div className="px-3 pb-3 pt-2.5">
									<div className="flex items-center gap-1.5">
										<span className="text-sm font-bold text-fd-foreground">{hs.name}</span>
										<span className="ml-auto rounded-full bg-fd-muted px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
											{hs.category}
										</span>
									</div>
								</div>
							</button>
						))}
					</div>
					</div>
			)}
		</div>
	);
}

function HighlightedText({ text }: { text: string }) {
	const parts = text.split(/(\{\{#[0-9a-fA-F]{6}:[^}]+\}\})/g);
	return (
		<>
			{parts.map((part, i) => {
				const match = part.match(/^\{\{(#[0-9a-fA-F]{6}):([^}]+)\}\}$/);
				if (match) {
					return (
						<span key={i} className="font-bold" style={{ color: match[1] }}>
							{match[2]}
						</span>
					);
				}
				return <span key={i}>{part}</span>;
			})}
		</>
	);
}

function NotesWithLinks({ text }: { text: string }) {
	const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
	return (
		<>
			{parts.map((part, i) => {
				const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
				if (match) {
					const [, label, url] = match;
					return (
						<span
							key={i}
							className="cursor-pointer font-bold text-fd-primary underline decoration-fd-primary/30 transition-colors hover:text-fd-primary/80"
							onClick={(e) => {
								e.stopPropagation();
								showLightbox([{ src: url!, alt: label! }], 0);
							}}
							onKeyDown={() => {}}
							role="button"
							tabIndex={0}
						>
							{label}
						</span>
					);
				}
				return <span key={i}>{part}</span>;
			})}
		</>
	);
}

function SkillCard({
	skill,
	skillImage,
	color,
	onSelect,
}: {
	skill: CharacterSkill;
	skillImage?: string;
	color: string;
	onSelect: () => void;
}) {
	const staticImage = skillImage;
	const demoGif = skill.gif;
	const hasImage = staticImage || demoGif;
	const showCost = skill.cost && skill.cost !== "--";

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 12, scale: 0.95 },
				visible: { opacity: 1, y: 0, scale: 1 },
			}}
		>
			<button
				type="button"
				className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-fd-border/50 bg-fd-card/80 text-left shadow-md shadow-black/10 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-fd-border hover:shadow-xl hover:shadow-black/20 dark:shadow-black/30 dark:hover:shadow-black/40"
				onClick={onSelect}
			>
				{/* Image area — rounded inside the card with margin */}
				<div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-fd-muted/20">
					{hasImage ? (
						<>
							{staticImage && (
								<img
									src={staticImage}
									alt={skill.name}
									className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${demoGif ? "group-hover:opacity-0" : ""}`}
									loading="lazy"
								/>
							)}
							{demoGif && (
								<img
									src={demoGif}
									alt={`${skill.name} 演示`}
									className={`absolute inset-0 h-full w-full object-contain transition-all duration-500 ${staticImage ? "opacity-0 group-hover:opacity-100" : "group-hover:scale-105"}`}
									style={{ background: "rgba(0,0,0,0.9)" }}
									loading="lazy"
								/>
							)}
						</>
					) : (
						<div
							className="flex h-full w-full items-center justify-center"
							style={{ background: `linear-gradient(145deg, ${color}15, ${color}05)` }}
						>
							{skill.icon ? (
								<img
									src={skill.icon}
									alt=""
									className="h-14 w-14 object-contain opacity-50"
									loading="lazy"
								/>
							) : (
								<span className="text-3xl opacity-15">⚔</span>
							)}
						</div>
					)}
				</div>

				{/* Info below image */}
				<div className="px-3 pb-3 pt-2.5">
					<div className="flex items-center gap-1.5">
						{skill.icon && (
							<img
								src={skill.icon}
								alt=""
								className="h-5 w-5 shrink-0 rounded object-cover"
								loading="lazy"
							/>
						)}
						<span className="shrink-0 text-sm font-bold text-fd-foreground">{skill.name}</span>
						<span className="ml-auto flex shrink-0 items-center gap-1">
							{showCost && (
								<span className="rounded-full bg-fd-muted px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
									{skill.cost}
								</span>
							)}
							{skill.command && skill.command !== "--" && (
								<span className="rounded-full bg-fd-muted px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
									{skill.command}
								</span>
							)}
							{skill.learnPoints && skill.learnPoints !== "--" && (
								<span className="rounded-full bg-fd-muted px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
									{skill.learnPoints}學點
								</span>
							)}
						</span>
					</div>
					{/* Notes */}
					{skill.notes && (
						<p className="mt-1 text-[11px] leading-relaxed text-fd-muted-foreground">
							<NotesWithLinks text={skill.notes} />
						</p>
					)}
				</div>
			</button>
		</motion.div>
	);
}

function RawStatsTable({ slug, color: _color }: { slug: string; color: string }) {
	const skillData = getCharacterSkillData(slug);
	const current = skillData?.stats?.current;
	const before = skillData?.stats?.before;

	if (!current) return <p className="text-sm text-fd-muted-foreground">暫無能力值數據</p>;

	return (
		<table className="w-full text-sm">
			<thead>
				<tr className="border-b border-fd-border">
					<th className="p-2 text-left">能力</th>
					<th className="p-2 text-right">能力值</th>
					<th className="p-2 text-right">成長值</th>
					{before && <th className="p-2 text-right text-fd-muted-foreground">舊能力值</th>}
					{before && <th className="p-2 text-right text-fd-muted-foreground">舊成長值</th>}
				</tr>
			</thead>
			<tbody>
				{STAT_KEYS.map((key) => {
					const k = key.toLowerCase();
					const c = current[k];
					const b = before?.[k];
					return (
						<tr key={key} className="border-b border-fd-border/30">
							<td className="p-2 font-bold">{key}</td>
							<td className="p-2 text-right font-mono">{c?.base ?? "--"}</td>
							<td
								className={`p-2 text-right font-mono ${c?.growth?.includes("+") ? "text-green-500" : c?.growth?.includes("-") ? "text-red-500" : ""}`}
							>
								{c?.growth ?? "--"}
							</td>
							{before && (
								<td className="p-2 text-right font-mono text-fd-muted-foreground">
									{b?.base ?? "--"}
								</td>
							)}
							{before && (
								<td
									className={`p-2 text-right font-mono text-fd-muted-foreground ${b?.growth?.includes("+") ? "text-green-600/60" : b?.growth?.includes("-") ? "text-red-600/60" : ""}`}
								>
									{b?.growth ?? "--"}
								</td>
							)}
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

function seededRandom(seed: string) {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
	}
	return () => {
		h = (h ^ (h >>> 16)) * 0x45d9f3b;
		h = (h ^ (h >>> 16)) * 0x45d9f3b;
		h = h ^ (h >>> 16);
		return ((h >>> 0) % 100) / 100;
	};
}
