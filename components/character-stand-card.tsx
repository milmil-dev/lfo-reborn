"use client";

import { ResponsiveRadar } from "@nivo/radar";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import transformsData from "@/data/transforms.json";
import {
	type CharacterSkill,
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
	hasTransform?: boolean;
	relic?: string;
	relicImage?: string;
	isTransform?: boolean;
}

export function CharacterStandCard() {
	const [data, setData] = useState<CharacterData | null>(null);

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
			hasTransform: isTransformPage ? false : char.hasTransform,
			relic: isTransformPage ? transform?.relic : undefined,
			relicImage: isTransformPage ? transform?.relicImage : undefined,
			isTransform: isTransformPage,
		});
	}, []);

	if (!data) return null;

	const motionKey = `${data.slug}-${data.isTransform ? "r" : "n"}`;

	return (
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

							<div className="flex gap-3">
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
						{data.relicImage && (
							<div className="flex items-center gap-3 border-t border-fd-border px-4 py-3">
								<img
									src={data.relicImage}
									alt={data.relic ?? "異轉信物"}
									className="h-24 w-auto rounded-lg object-contain"
								/>
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
											<p className="text-base font-black" style={{ color: data.color }}>
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
														<span className="font-bold" style={{ color: data.color }}>
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
											<p className="text-base font-black" style={{ color: data.color }}>
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
					color={data.color}
				/>

				{/* Portraits */}
				{data.portraits && data.portraits.length > 0 && (
					<div>
						<h2 id="portraits" className="mb-3 text-lg font-bold">
							角色型像及對話圖
						</h2>
						<div className="flex flex-wrap gap-3">
							{data.portraits.map((p) => (
								<div key={p.label} className="flex flex-col items-center gap-1">
									<img
										src={p.url}
										alt={p.label}
										className="h-28 w-auto rounded-lg border border-fd-border object-contain"
										loading="lazy"
									/>
									<span className="text-xs text-fd-muted-foreground">{p.label}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Dialog Portraits */}
				{data.dialogs && data.dialogs.length > 0 && (
					<details className="rounded-lg border border-fd-border">
						<summary className="cursor-pointer p-3 text-sm font-bold text-fd-muted-foreground hover:text-fd-foreground">
							對話圖 ({data.dialogs.length})
						</summary>
						<div className="grid grid-cols-4 gap-2 border-t border-fd-border p-3 sm:grid-cols-6 md:grid-cols-8">
							{data.dialogs.map((url) => (
								<img
									key={url}
									src={url}
									alt="對話"
									className="aspect-square w-full rounded border border-fd-border object-cover"
									loading="lazy"
								/>
							))}
						</div>
					</details>
				)}

				{/* Raw Stats Table */}
				{data.stats.length > 0 && (
					<details className="rounded-lg border border-fd-border">
						<summary className="cursor-pointer p-3 text-sm font-bold text-fd-muted-foreground hover:text-fd-foreground">
							查看詳細能力值
						</summary>
						<div className="border-t border-fd-border p-3">
							<RawStatsTable slug={data.slug} color={data.color} />
						</div>
					</details>
				)}
			</motion.div>
		</AnimatePresence>
	);
}

function SkillsPanel({
	skills,
	skillImages,
	actionGifs,
	color,
}: {
	skills: CharacterSkill[];
	skillImages: SkillImage[];
	actionGifs: ActionGif[];
	color: string;
}) {
	const [selectedSkill, setSelectedSkill] = useState<number | null>(null);

	const hasSkills = skills.length > 0;
	const hasActions = actionGifs.length > 0;

	if (!hasSkills && !hasActions) return null;

	const skillImageMap = new Map(skillImages.map((si) => [si.name, si.url]));

	return (
		<div className="space-y-6">
			{/* Skills Card Grid */}
			{hasSkills && (
				<div>
					<h2 id="skills" className="mb-3 text-lg font-bold">
						招式技能
					</h2>
					<motion.div
						className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
						initial="hidden"
						animate="visible"
						variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
					>
						{skills.map((skill, i) => (
							<SkillCard
								key={skill.name}
								skill={skill}
								skillImage={skillImageMap.get(skill.name)}
								color={color}
								isSelected={selectedSkill === i}
								onSelect={() => setSelectedSkill(selectedSkill === i ? null : i)}
							/>
						))}
					</motion.div>

					{/* Selected skill detail overlay */}
					<AnimatePresence>
						{selectedSkill !== null && skills[selectedSkill] && (
							<SkillDetail
								skill={skills[selectedSkill]}
								skillImage={skillImageMap.get(skills[selectedSkill].name)}
								color={color}
								onClose={() => setSelectedSkill(null)}
							/>
						)}
					</AnimatePresence>
				</div>
			)}

			{/* Action GIFs */}
			{hasActions && (
				<div>
					<h2 id="actions" className="mb-3 text-lg font-bold">
						基本動作
					</h2>
					<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
						{actionGifs.map((ag) => (
							<div
								key={ag.label}
								className="flex flex-col items-center gap-1 rounded-xl border border-fd-border/50 bg-fd-muted/20 p-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-fd-border hover:bg-fd-muted/40"
							>
								<img
									src={ag.url}
									alt={ag.label}
									className="h-20 w-auto object-contain"
									loading="lazy"
								/>
								<span className="text-[10px] font-bold text-fd-muted-foreground">{ag.label}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function SkillCard({
	skill,
	skillImage,
	color,
	isSelected,
	onSelect,
}: {
	skill: CharacterSkill;
	skillImage?: string;
	color: string;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const staticImage = skillImage;
	const demoGif = skill.gif;
	const hasImage = staticImage || demoGif;
	const showCost = skill.cost && skill.cost !== "--";

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 12 },
				visible: { opacity: 1, y: 0 },
			}}
		>
			<button
				type="button"
				className="group relative w-full overflow-hidden rounded-xl text-left transition-all duration-300"
				style={{
					border: isSelected ? `1.5px solid ${color}` : "1.5px solid transparent",
					boxShadow: isSelected ? `0 0 20px ${color}20` : "none",
				}}
				onClick={onSelect}
			>
				{/* Card image area */}
				<div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-fd-muted/30">
					{hasImage ? (
						<>
							{/* Static skill image (default) */}
							{staticImage && (
								<img
									src={staticImage}
									alt={skill.name}
									className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${demoGif ? "group-hover:opacity-0" : ""}`}
									loading="lazy"
								/>
							)}
							{/* Demo GIF (shown on hover) */}
							{demoGif && (
								<img
									src={demoGif}
									alt={`${skill.name} 演示`}
									className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${staticImage ? "opacity-0 group-hover:opacity-100" : ""}`}
									loading="lazy"
								/>
							)}
						</>
					) : (
						<div
							className="flex h-full w-full items-center justify-center"
							style={{ background: `linear-gradient(135deg, ${color}12, ${color}05)` }}
						>
							{skill.icon ? (
								<img
									src={skill.icon}
									alt=""
									className="h-16 w-16 object-contain opacity-60"
									loading="lazy"
								/>
							) : (
								<span className="text-3xl opacity-20">⚔</span>
							)}
						</div>
					)}

					{/* Gradient overlay */}
					<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

					{/* Icon badge */}
					{skill.icon && cardImage && (
						<div
							className="absolute left-2 top-2 h-7 w-7 overflow-hidden rounded-lg shadow-lg"
							style={{ border: `1px solid ${color}40` }}
						>
							<img src={skill.icon} alt="" className="h-full w-full object-cover" loading="lazy" />
						</div>
					)}

					{/* Cost badge */}
					{showCost && (
						<span
							className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm"
							style={{ background: `${color}cc` }}
						>
							{skill.cost}
						</span>
					)}

					{/* Bottom content overlay */}
					<div className="absolute inset-x-0 bottom-0 p-2.5">
						<p className="text-sm font-bold leading-tight text-white drop-shadow-lg">
							{skill.name}
						</p>
						{skill.command && skill.command !== "--" && (
							<span className="mt-0.5 inline-block rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur-sm">
								{skill.command}
							</span>
						)}
					</div>
				</div>
			</button>
		</motion.div>
	);
}

function SkillDetail({
	skill,
	skillImage,
	color,
	onClose,
}: {
	skill: CharacterSkill;
	skillImage?: string;
	color: string;
	onClose: () => void;
}) {
	const demoGif = skill.gif;
	const showCost = skill.cost && skill.cost !== "--";
	const showLP = skill.learnPoints && skill.learnPoints !== "--";

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
			exit={{ opacity: 0, y: 8, transition: { duration: 0.15, ease: "easeIn" } }}
			className="mt-3 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
		>
			<div className="flex flex-col gap-4 p-4 sm:flex-row">
				{/* Demo GIF */}
				{demoGif && (
					<div className="shrink-0 overflow-hidden rounded-lg sm:w-56">
						<img
							src={demoGif}
							alt={`${skill.name} 演示`}
							className="h-auto w-full rounded-lg object-contain"
							loading="lazy"
						/>
					</div>
				)}

				{/* Skill image (if different from gif) */}
				{skillImage && !demoGif && (
					<div className="shrink-0 overflow-hidden rounded-lg sm:w-56">
						<img
							src={skillImage}
							alt={skill.name}
							className="h-auto w-full rounded-lg object-cover"
							loading="lazy"
						/>
					</div>
				)}

				{/* Info */}
				<div className="flex flex-1 flex-col gap-2">
					<div className="flex items-center gap-2">
						{skill.icon && (
							<img
								src={skill.icon}
								alt=""
								className="h-8 w-8 rounded-lg object-cover"
								loading="lazy"
							/>
						)}
						<h3 className="text-lg font-bold" style={{ color }}>
							{skill.name}
						</h3>
					</div>

					<div className="flex flex-wrap gap-1.5">
						{showCost && (
							<span
								className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
								style={{ background: `${color}cc` }}
							>
								{skill.cost}
							</span>
						)}
						{showLP && (
							<span className="rounded-md bg-fd-muted px-2 py-0.5 text-xs font-bold text-fd-muted-foreground">
								{skill.learnPoints}學點
							</span>
						)}
						{skill.command && skill.command !== "--" && (
							<span className="rounded-md bg-fd-muted px-2 py-0.5 font-mono text-xs text-fd-muted-foreground">
								{skill.command}
							</span>
						)}
						{skill.trigger && skill.trigger !== "--" && (
							<span
								className="rounded-md px-2 py-0.5 text-xs font-bold"
								style={{ background: `${color}15`, color }}
							>
								觸發: {skill.trigger}
							</span>
						)}
					</div>

					{skill.notes && (
						<p className="text-sm leading-relaxed text-fd-muted-foreground">{skill.notes}</p>
					)}

					<button
						type="button"
						className="mt-auto self-end rounded-lg px-3 py-1 text-xs font-bold text-fd-muted-foreground transition-colors hover:bg-fd-muted hover:text-fd-foreground"
						onClick={onClose}
					>
						收起
					</button>
				</div>
			</div>
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
