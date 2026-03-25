"use client";

import type { LucideIcon } from "lucide-react";
import {
	Coins,
	ExternalLink,
	Footprints,
	Heart,
	Info,
	Shield,
	Sparkles,
	Sword,
	Wand2,
	Wrench,
	Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import itemsData from "@/data/items.json";
import { cn } from "@/lib/utils";

interface Item {
	name: string;
	image: string | null;
	type?: string | null;
	material: string | null;
	effect: string | null;
	consumption: string | null;
	demo: string | null;
	durability: number | null;
	price: number | null;
	description: string | null;
	stats: Record<string, string>;
	requirements: Record<string, string>;
}

interface Category {
	title: string;
	items: Item[];
}

const MATERIAL_META: Record<string, { badge: string; glow: string; color: string }> = {
	金: {
		badge: "bg-amber-400/15 text-amber-400 border-amber-400/30",
		glow: "rgba(251,191,36,0.2)",
		color: "text-amber-400",
	},
	鐵: {
		badge: "bg-zinc-400/15 text-zinc-400 border-zinc-400/30",
		glow: "rgba(161,161,170,0.15)",
		color: "text-zinc-400",
	},
	鋼: {
		badge: "bg-sky-400/15 text-sky-300 border-sky-400/30",
		glow: "rgba(56,189,248,0.15)",
		color: "text-sky-300",
	},
	銅: {
		badge: "bg-orange-400/15 text-orange-400 border-orange-400/30",
		glow: "rgba(251,146,60,0.2)",
		color: "text-orange-400",
	},
	合金: {
		badge: "bg-purple-400/15 text-purple-400 border-purple-400/30",
		glow: "rgba(192,132,252,0.2)",
		color: "text-purple-400",
	},
	布料: {
		badge: "bg-blue-400/15 text-blue-400 border-blue-400/30",
		glow: "rgba(96,165,250,0.15)",
		color: "text-blue-400",
	},
	塑膠: {
		badge: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
		glow: "rgba(52,211,153,0.15)",
		color: "text-emerald-400",
	},
	木材: {
		badge: "bg-yellow-700/20 text-yellow-600 border-yellow-700/40",
		glow: "rgba(161,98,7,0.18)",
		color: "text-yellow-700",
	},
	魔精石: {
		badge: "bg-red-400/15 text-red-400 border-red-400/30",
		glow: "rgba(248,113,113,0.22)",
		color: "text-red-400",
	},
};

const STAT_CONFIG: Record<string, { label: string; icon: LucideIcon; color: string }> = {
	生命值: { label: "HP", icon: Heart, color: "text-rose-400" },
	元力值: { label: "MP", icon: Zap, color: "text-blue-400" },
	氣力值: { label: "SP", icon: Sparkles, color: "text-yellow-400" },
	攻擊力: { label: "ATK", icon: Sword, color: "text-orange-400" },
	防禦力: { label: "DEF", icon: Shield, color: "text-cyan-400" },
	敏捷度: { label: "AGI", icon: Footprints, color: "text-emerald-400" },
};

function ItemCard({ item }: { item: Item }) {
	const [imgError, setImgError] = useState(false);
	const [hovered, setHovered] = useState(false);

	const isRare = item.name.includes("[稀有]");
	const meta = item.material ? (MATERIAL_META[item.material] ?? null) : null;
	const glowColor = meta?.glow ?? "rgba(255,255,255,0.05)";

	const bonusEntries = Object.entries(item.stats ?? {}).filter(([, v]) => v && v !== "--");
	const reqEntries = Object.entries(item.requirements ?? {}).filter(([, v]) => v && v !== "--");

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			className={cn(
				"group relative flex flex-col overflow-hidden rounded-xl border border-fd-border bg-fd-card/50 backdrop-blur-sm transition-all duration-300",
				"hover:border-fd-primary/50 hover:shadow-2xl hover:shadow-fd-primary/5 hover:-translate-y-1",
				isRare &&
					"border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:border-amber-500/60",
			)}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{/* Rare highlight ribbon */}
			{isRare && (
				<div className="absolute -right-6 top-1 z-10 w-24 rotate-45 bg-amber-500/20 py-0.5 text-center text-[8px] font-bold tracking-tighter text-amber-500 backdrop-blur-md border-y border-amber-500/30">
					RARE
				</div>
			)}

			{/* Image area */}
			<div
				className="relative flex h-28 w-full items-center justify-center overflow-hidden border-b border-fd-border/30"
				style={{
					background: `radial-gradient(circle at center, ${glowColor} 0%, transparent 80%), hsl(var(--fd-muted) / 0.4)`,
				}}
			>
				{item.image && !imgError ? (
					<motion.img
						src={item.image}
						alt={item.name}
						animate={hovered ? { scale: 1.15, rotate: 2 } : { scale: 1, rotate: 0 }}
						transition={{ type: "spring", stiffness: 300, damping: 20 }}
						className="h-16 w-16 object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]"
						onError={() => setImgError(true)}
						loading="lazy"
					/>
				) : (
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-fd-muted/50 border border-fd-border/30">
						<span className="text-xl text-fd-muted-foreground/30 font-serif">?</span>
					</div>
				)}

				{/* Demo hover overlay */}
				<AnimatePresence>
					{hovered && item.demo && (
						<motion.a
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							href={item.demo}
							target="_blank"
							rel="noopener noreferrer"
							className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex flex-col items-center gap-1.5">
								<div className="flex h-10 w-10 items-center justify-center rounded-full bg-fd-primary text-fd-primary-foreground shadow-xl">
									<Sword className="h-5 w-5 fill-current" />
								</div>
								<span className="text-[10px] font-bold tracking-widest text-white/80 uppercase">
									演示預覽
								</span>
							</div>
						</motion.a>
					)}
				</AnimatePresence>

				{/* Material/Type badges (floating) */}
				<div className="absolute left-2 top-2 flex flex-col gap-1 z-10">
					{meta && (
						<span
							className={cn(
								"rounded-sm border px-1.5 py-0.5 text-[9px] font-bold tracking-tight backdrop-blur-md shadow-sm",
								meta.badge,
							)}
						>
							{item.material}
						</span>
					)}
				</div>
			</div>

			{/* Body */}
			<div className="flex flex-1 flex-col gap-2.5 p-3">
				{/* Name */}
				<div className="space-y-0.5">
					<h4
						className={cn(
							"line-clamp-2 min-h-[2.5rem] font-serif text-[13px] font-bold leading-tight text-fd-foreground",
							isRare && "text-amber-100 group-hover:text-amber-400 transition-colors",
						)}
					>
						{item.name}
					</h4>
				</div>

				{/* Description / Lore */}
				{item.description && (
					<div className="relative">
						<div className="absolute -left-1.5 top-0 bottom-0 w-0.5 bg-fd-primary/20 rounded-full" />
						<p className="text-[10.5px] italic leading-relaxed text-fd-muted-foreground/80 line-clamp-3">
							{item.description}
						</p>
					</div>
				)}

				{/* Special Effect */}
				{item.effect && (
					<div className="flex items-start gap-1.5 rounded-lg border border-fd-primary/20 bg-fd-primary/5 p-2">
						<Wand2 className="h-3 w-3 shrink-0 text-fd-primary mt-0.5" />
						<div className="space-y-0.5">
							<p className="text-[10px] font-bold uppercase tracking-wider text-fd-primary/80">
								特效能力
							</p>
							<p className="text-[10.5px] leading-snug text-fd-foreground/90 font-medium">
								{item.effect}
							</p>
							{item.consumption && (
								<p className="text-[9px] text-fd-muted-foreground italic">
									消耗: {item.consumption}
								</p>
							)}
						</div>
					</div>
				)}

				{/* Bonus stats */}
				{bonusEntries.length > 0 && (
					<div className="space-y-1.5">
						<div className="flex items-center gap-1 opacity-50">
							<div className="h-px flex-1 bg-fd-border" />
							<span className="text-[8px] font-bold uppercase tracking-widest">數值加成</span>
							<div className="h-px flex-1 bg-fd-border" />
						</div>
						<div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
							{bonusEntries.map(([key, value]) => {
								const config = STAT_CONFIG[key];
								const Icon = config?.icon ?? Info;
								const isPos = value.startsWith("+");
								const isNeg = value.startsWith("-");
								const valColor = isPos
									? "text-emerald-400"
									: isNeg
										? "text-rose-400"
										: "text-fd-muted-foreground";

								return (
									<div key={key} className="flex items-center justify-between gap-1 group/stat">
										<div className="flex items-center gap-1.5">
											<Icon
												className={cn("h-3 w-3", config?.color ?? "text-fd-muted-foreground")}
											/>
											<span className="text-[10px] font-medium text-fd-muted-foreground/70 uppercase">
												{config?.label ?? key}
											</span>
										</div>
										<span className={cn("font-mono text-[10px] font-bold", valColor)}>{value}</span>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Requirements */}
				{reqEntries.length > 0 && (
					<div className="mt-1 rounded-md bg-fd-muted/30 p-1.5 border border-fd-border/30">
						<p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-fd-muted-foreground/40">
							使用需求
						</p>
						<div className="flex flex-wrap gap-x-3 gap-y-0.5">
							{reqEntries.map(([key, value]) => (
								<div key={key} className="flex items-center gap-1">
									<span className="text-[9px] text-fd-muted-foreground/60">{key}:</span>
									<span className="font-mono text-[9px] font-bold text-fd-foreground/80">
										{value}
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Footer: price + durability */}
				{(item.price != null || item.durability != null) && (
					<div className="mt-auto flex items-center justify-between border-t border-fd-border/30 pt-2.5 text-[11px]">
						{item.price != null ? (
							<div className="flex items-center gap-1">
								<Coins className="h-3 w-3 text-amber-500/70" />
								<span className="font-mono font-bold text-amber-500">
									{item.price.toLocaleString()}
								</span>
							</div>
						) : (
							<div />
						)}
						{item.durability != null && (
							<div className="flex items-center gap-1 text-fd-muted-foreground/60">
								<Wrench className="h-2.5 w-2.5" />
								<span className="text-[10px] font-medium">{item.durability}</span>
							</div>
						)}
					</div>
				)}
			</div>
		</motion.div>
	);
}

export function ItemsGrid() {
	const path = typeof window !== "undefined" ? window.location.pathname : "";
	const match = path.match(/\/docs\/items\/([^/]+)$/);
	if (!match) return null;

	const slug = match[1];
	const categoryData = itemsData as unknown as Record<string, Category>;
	if (!slug || !categoryData[slug]) return null;
	const data = categoryData[slug];

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
			{data.items.map((item: Item) => (
				<ItemCard key={`${item.name}-${item.price}-${item.durability}`} item={item} />
			))}
		</div>
	);
}

export function ItemsIndex() {
	const categories = Object.entries(itemsData as unknown as Record<string, Category>);

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{categories.map(([key, data]) => {
				const sampleImages = data.items
					.filter((i) => i.image)
					.slice(0, 4)
					.map((i) => i.image as string);

				return (
					<motion.a
						key={key}
						href={`/docs/items/${key}`}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-fd-border bg-fd-card/50 p-5 transition-all hover:border-fd-primary/50 hover:shadow-xl hover:shadow-fd-primary/5"
					>
						{/* Sample item images as grid mosaic */}
						<div className="relative h-16 w-16 shrink-0 shadow-inner">
							{sampleImages.length >= 4 ? (
								<div className="grid h-16 w-16 grid-cols-2 gap-1 rounded-xl overflow-hidden bg-fd-muted/30 p-1">
									{sampleImages.slice(0, 4).map((src) => (
										<img
											key={src}
											src={src}
											alt=""
											className="h-full w-full object-contain drop-shadow-sm"
											loading="lazy"
										/>
									))}
								</div>
							) : sampleImages[0] ? (
								<div className="flex h-16 w-16 items-center justify-center rounded-xl bg-fd-muted/30 border border-fd-border/30">
									<img
										src={sampleImages[0]}
										alt=""
										className="h-12 w-12 object-contain drop-shadow-md"
										loading="lazy"
									/>
								</div>
							) : (
								<div className="flex h-16 w-16 items-center justify-center rounded-xl bg-fd-muted border border-fd-border/30 text-fd-muted-foreground/30 font-serif">
									<span className="text-2xl">?</span>
								</div>
							)}
						</div>

						<div className="min-w-0 flex-1 space-y-1">
							<h3 className="font-serif text-lg font-bold text-fd-foreground group-hover:text-fd-primary transition-colors">
								{data.title}
							</h3>
							<div className="flex items-center gap-2">
								<span className="rounded bg-fd-muted px-1.5 py-0.5 text-[10px] font-bold text-fd-muted-foreground">
									{data.items.length} 項目
								</span>
								<div className="h-1 w-1 rounded-full bg-fd-muted-foreground/30" />
								<span className="text-[10px] text-fd-muted-foreground uppercase tracking-widest font-medium">
									Explore
								</span>
							</div>
						</div>

						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-fd-muted/50 group-hover:bg-fd-primary/10 transition-colors">
							<ExternalLink className="h-4 w-4 text-fd-muted-foreground/40 group-hover:text-fd-primary transition-all" />
						</div>
					</motion.a>
				);
			})}
		</div>
	);
}
