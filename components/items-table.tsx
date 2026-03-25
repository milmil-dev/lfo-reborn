"use client";

import type { LucideIcon } from "lucide-react";
import {
	Coins,
	ExternalLink,
	Footprints,
	Heart,
	Info,
	Search,
	Shield,
	SlidersHorizontal,
	Sparkles,
	Sword,
	Wand2,
	Wrench,
	X,
	Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import itemsData from "@/data/items.json";
import { cn } from "@/lib/utils";
import { ItemHoverCardProvider, useItemHoverCard } from "./item-hover-card";

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
	const containerRef = useRef<HTMLDivElement>(null);
	const { show, hide } = useItemHoverCard();

	const isRare = item.name.includes("[稀有]");
	const meta = item.material ? (MATERIAL_META[item.material] ?? null) : null;
	const glowColor = meta?.glow ?? "rgba(255,255,255,0.05)";

	const bonusEntries = Object.entries(item.stats ?? {}).filter(([, v]) => v && v !== "--");
	const reqEntries = Object.entries(item.requirements ?? {}).filter(([, v]) => v && v !== "--");

	// Clean up description if it just repeats the name
	const displayDescription =
		item.description && item.description !== item.name ? item.description : null;

	const handleMouseEnter = useCallback(() => {
		setHovered(true);
		if (item.demo && containerRef.current) {
			show(item.name, item.demo, containerRef.current.getBoundingClientRect());
		}
	}, [item.name, item.demo, show]);

	const handleMouseLeave = useCallback(() => {
		setHovered(false);
		hide();
	}, [hide]);

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			className={cn(
				"group relative flex flex-col rounded-2xl border border-fd-border/45 bg-fd-card/75 backdrop-blur-md transition-all duration-500 hover:z-10",
				"hover:border-fd-primary/45 hover:shadow-[0_18px_40px_rgba(0,0,0,0.22)] hover:-translate-y-1",
				isRare &&
					"border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.03)] hover:border-amber-500/50 hover:shadow-[0_0_30px_rgba(245,158,11,0.1)]",
			)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{/* Rare highlight ribbon */}
			{isRare && (
				<div className="absolute -right-6 top-2 z-20 w-24 rotate-45 border-y border-amber-500/30 bg-amber-500/10 py-0.5 text-center text-[8px] font-black tracking-tighter text-amber-500 backdrop-blur-md">
					RARE
				</div>
			)}

			{/* Image area */}
			<div
				ref={containerRef}
				className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-t-2xl border-b border-fd-border/30 bg-fd-muted/20"
				style={{
					background: `radial-gradient(circle at center, ${glowColor} 0%, transparent 70%)`,
				}}
			>
				{item.image && !imgError ? (
					<motion.img
						src={item.image}
						alt={item.name}
						animate={hovered ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
						transition={{ type: "spring", stiffness: 200, damping: 25 }}
						className="h-24 w-24 object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.6)]"
						onError={() => setImgError(true)}
						loading="lazy"
					/>
				) : (
					<div className="flex h-16 w-16 items-center justify-center rounded-full border border-fd-border/30 bg-fd-muted/50">
						<span className="font-serif text-2xl text-fd-muted-foreground/20">?</span>
					</div>
				)}

				{/* GIF Demo Overlay (Mobile fallback) */}
				<AnimatePresence>
					{hovered && item.demo && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[2px] md:hidden"
						>
							<img src={item.demo} alt="Demo" className="h-full w-full object-contain p-4" />
						</motion.div>
					)}
				</AnimatePresence>

				{/* Top Badges */}
				<div className="absolute left-3 top-3 z-20 flex flex-col gap-1.5">
					{meta && (
						<span
							className={cn(
								"rounded-md border px-2 py-0.5 text-[10px] font-black tracking-wide backdrop-blur-md shadow-lg",
								meta.badge,
							)}
						>
							{item.material}
						</span>
					)}
					{item.demo && (
						<span className="flex items-center gap-1 rounded-md border border-fd-primary/30 bg-fd-primary/10 px-2 py-0.5 text-[8px] font-black tracking-widest text-fd-primary backdrop-blur-md shadow-lg uppercase">
							<div className="h-1 w-1 animate-pulse rounded-full bg-fd-primary" />
							Demo
						</span>
					)}
				</div>
			</div>

			{/* Body */}
			<div className="flex flex-1 flex-col gap-3 p-4">
				{/* Header: Name + Price */}
				<div className="flex items-start justify-between gap-2">
					<h4
						className={cn(
							"font-sans text-[15px] font-black leading-tight tracking-tight text-fd-foreground",
							isRare && "text-amber-100 group-hover:text-amber-400 transition-colors",
						)}
					>
						{item.name}
					</h4>
					{item.price != null && (
						<div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5">
							<Coins className="h-3 w-3 text-amber-500" />
							<span className="font-mono text-xs font-bold text-amber-500">
								{item.price.toLocaleString()}
							</span>
						</div>
					)}
				</div>

				{/* Description / Lore */}
				{displayDescription && (
					<p className="border-l-2 border-fd-primary/30 pl-3 text-[11px] font-medium leading-relaxed text-fd-muted-foreground/80">
						{displayDescription}
					</p>
				)}

				{/* Special Effect - Modernized */}
				{item.effect && (
					<div className="group/effect relative overflow-hidden rounded-xl border border-fd-primary/10 bg-fd-primary/5 p-3 transition-colors hover:border-fd-primary/30">
						<div className="relative z-10 flex items-start gap-2.5">
							<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-fd-primary/10 text-fd-primary shadow-inner">
								<Wand2 className="h-3.5 w-3.5" />
							</div>
							<div className="space-y-1">
								<p className="text-[10px] font-black uppercase tracking-[0.1em] text-fd-primary/60">
									特效能力
								</p>
								<p className="text-[11.5px] font-bold leading-snug text-fd-foreground/90">
									{item.effect}
								</p>
								{item.consumption && (
									<p className="flex items-center gap-1 text-[10px] font-medium text-fd-muted-foreground/70 italic">
										<Zap className="h-2.5 w-2.5" /> 消耗: {item.consumption}
									</p>
								)}
							</div>
						</div>
						{/* Background decorative glow */}
						<div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-fd-primary/5 blur-2xl transition-all group-hover/effect:bg-fd-primary/10" />
					</div>
				)}

				{/* Stats Grid - Cleaner */}
				{(bonusEntries.length > 0 || item.durability != null) && (
					<div className="mt-1 flex flex-col gap-2">
						{bonusEntries.length > 0 && (
							<div className="grid grid-cols-2 gap-2">
								{bonusEntries.map(([key, value]) => {
									const config = STAT_CONFIG[key];
									const Icon = config?.icon ?? Info;
									const isPos = value.startsWith("+");
									const isNeg = value.startsWith("-");
									const valColor = isPos
										? "text-emerald-400"
										: isNeg
											? "text-rose-400"
											: "text-fd-foreground";

									return (
										<div
											key={key}
											className="flex items-center justify-between rounded-lg border border-fd-border/50 bg-fd-muted/30 px-2.5 py-1.5 shadow-sm"
										>
											<div className="flex items-center gap-2">
												<Icon
													className={cn("h-3 w-3", config?.color ?? "text-fd-muted-foreground")}
												/>
												<span className="text-[9px] font-black uppercase tracking-wider text-fd-muted-foreground/80">
													{config?.label ?? key}
												</span>
											</div>
											<span className={cn("font-mono text-xs font-black", valColor)}>{value}</span>
										</div>
									);
								})}
							</div>
						)}

						{/* Durability as a bar or badge */}
						{item.durability != null && (
							<div className="flex items-center justify-between rounded-lg border border-fd-border/50 bg-fd-muted/30 px-2.5 py-1.5">
								<div className="flex items-center gap-2 text-fd-muted-foreground/80">
									<Wrench className="h-3 w-3" />
									<span className="text-[9px] font-black uppercase tracking-wider">Durability</span>
								</div>
								<span className="font-mono text-xs font-black text-fd-foreground">
									{item.durability}
								</span>
							</div>
						)}
					</div>
				)}

				{/* Requirements - Minimalist */}
				{reqEntries.length > 0 && (
					<div className="mt-1 flex flex-wrap gap-2">
						{reqEntries.map(([key, value]) => (
							<div
								key={key}
								className="flex items-center gap-1.5 rounded-md border border-fd-border/50 bg-fd-muted/20 px-2 py-1"
							>
								<span className="text-[9px] font-black uppercase tracking-tighter text-fd-muted-foreground/60">
									{key}
								</span>
								<span className="font-mono text-[10px] font-black text-fd-foreground/70">
									{value}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</motion.div>
	);
}

export function ItemsGrid() {
	const path = typeof window !== "undefined" ? window.location.pathname : "";
	const match = path.match(/\/docs\/items\/([^/]+)$/);
	const slug = match ? match[1] : null;
	const categoryData = itemsData as unknown as Record<string, Category>;
	const data = slug ? categoryData[slug] : null;

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);

	const materials = useMemo(() => {
		if (!data) return [];
		const unique = new Set<string>();
		for (const item of data.items) {
			if (item.material) unique.add(item.material);
		}
		return Array.from(unique).sort();
	}, [data]);

	const filteredItems = useMemo(() => {
		if (!data) return [];
		return data.items.filter((item) => {
			const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesMaterial = !selectedMaterial || item.material === selectedMaterial;
			return matchesSearch && matchesMaterial;
		});
	}, [data, searchQuery, selectedMaterial]);

	if (!data) return null;

	return (
		<ItemHoverCardProvider>
			<div className="space-y-8">
				{/* Filter Toolbar - Modern Museum Style */}
				<div className="sticky top-[var(--fd-banner-height,0)] z-40 space-y-4 rounded-3xl border border-fd-border/50 bg-fd-background/60 py-6 backdrop-blur-xl transition-all md:px-6">
					<div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
						{/* Search Field */}
						<div className="relative group flex-1 max-w-md">
							<Search className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-fd-muted-foreground transition-colors group-focus-within:text-fd-primary" />
							<input
								type="text"
								placeholder="在收藏庫中搜尋道具..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-12 w-full rounded-2xl border border-fd-border bg-fd-muted/30 pl-11 pr-10 text-[15px] font-medium transition-all focus:border-fd-primary/50 focus:bg-fd-background focus:outline-none focus:ring-4 focus:ring-fd-primary/5 shadow-inner"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-fd-muted-foreground hover:bg-fd-muted hover:text-fd-foreground transition-all"
								>
									<X className="h-4 w-4" />
								</button>
							)}
						</div>

						{/* Quick Results Counter */}
						<div className="hidden lg:flex flex-col items-end gap-0.5 border-r border-fd-border/50 pr-8">
							<span className="text-[10px] font-black uppercase tracking-[0.2em] text-fd-muted-foreground/50">
								Current Collection
							</span>
							<span className="font-serif text-2xl font-black text-fd-foreground">
								{filteredItems.length}{" "}
								<span className="text-xs text-fd-muted-foreground/60">ITEMS</span>
							</span>
						</div>
					</div>

					{/* Material Selector */}
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-3 px-1">
							<div className="flex h-5 w-5 items-center justify-center rounded-md bg-fd-primary/10 text-fd-primary">
								<SlidersHorizontal className="h-3 w-3" />
							</div>
							<span className="text-[10px] font-black uppercase tracking-[0.2em] text-fd-muted-foreground">
								材質篩選庫
							</span>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={() => setSelectedMaterial(null)}
								className={cn(
									"rounded-xl px-5 py-2 text-xs font-black transition-all border",
									!selectedMaterial
										? "bg-fd-primary text-fd-primary-foreground border-fd-primary shadow-[0_8px_20px_-6px_rgba(var(--primary),0.4)]"
										: "bg-fd-muted/30 text-fd-muted-foreground border-fd-border/50 hover:border-fd-primary/30 hover:bg-fd-primary/5",
								)}
							>
								全部典藏
							</button>

							{materials.map((m) => {
								const meta = MATERIAL_META[m];
								const isActive = selectedMaterial === m;
								return (
									<button
										key={m}
										type="button"
										onClick={() => setSelectedMaterial(isActive ? null : m)}
										className={cn(
											"rounded-xl px-5 py-2 text-xs font-black transition-all border shadow-sm",
											isActive
												? meta?.badge ||
														"bg-fd-primary text-fd-primary-foreground border-fd-primary"
												: "bg-fd-muted/30 text-fd-muted-foreground border-fd-border/50 hover:border-fd-primary/30 hover:bg-fd-primary/5",
										)}
									>
										{m}
									</button>
								);
							})}
						</div>
					</div>
				</div>

				{/* Grid Section */}
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
					<AnimatePresence mode="popLayout">
						{filteredItems.map((item: Item) => (
							<motion.div
								layout
								key={`${item.name}-${item.price}-${item.durability}`}
								initial={{ opacity: 0, scale: 0.9 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.9 }}
								transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
							>
								<ItemCard item={item} />
							</motion.div>
						))}
					</AnimatePresence>
				</div>

				{filteredItems.length === 0 && (
					<div className="flex flex-col items-center justify-center py-32 text-fd-muted-foreground">
						<div className="relative mb-6">
							<Search className="h-16 w-16 opacity-10" />
							<motion.div
								animate={{ scale: [1, 1.1, 1] }}
								transition={{ duration: 2, repeat: Infinity }}
								className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-fd-primary/20"
							/>
						</div>
						<p className="font-serif text-xl font-black tracking-tight text-fd-foreground/80">
							未發現匹配的道具
						</p>
						<p className="mt-2 text-[13px] font-medium opacity-60">
							請嘗試調整您的篩選條件或關鍵字
						</p>
						<button
							type="button"
							onClick={() => {
								setSearchQuery("");
								setSelectedMaterial(null);
							}}
							className="mt-8 rounded-xl border border-fd-primary/30 px-6 py-2.5 text-xs font-black tracking-widest text-fd-primary transition-all hover:bg-fd-primary hover:text-fd-primary-foreground uppercase shadow-lg shadow-fd-primary/10"
						>
							重設所有篩選
						</button>
					</div>
				)}
			</div>
		</ItemHoverCardProvider>
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
								<div className="grid h-16 w-16 grid-cols-2 gap-1 overflow-hidden rounded-xl bg-fd-muted/30 p-1">
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
								<div className="flex h-16 w-16 items-center justify-center rounded-xl border border-fd-border/30 bg-fd-muted/30">
									<img
										src={sampleImages[0]}
										alt=""
										className="h-12 w-12 object-contain drop-shadow-md"
										loading="lazy"
									/>
								</div>
							) : (
								<div className="flex h-16 w-16 items-center justify-center rounded-xl border border-fd-border/30 bg-fd-muted text-fd-muted-foreground/30 font-serif">
									<span className="text-2xl">?</span>
								</div>
							)}
						</div>

						<div className="min-w-0 flex-1 space-y-1">
							<h3 className="font-sans text-lg font-bold text-fd-foreground group-hover:text-fd-primary transition-colors">
								{data.title}
							</h3>
							<div className="flex items-center gap-2">
								<span className="rounded bg-fd-muted px-1.5 py-0.5 text-[10px] font-bold text-fd-muted-foreground">
									{data.items.length} 項目
								</span>
								<div className="h-1 w-1 rounded-full bg-fd-muted-foreground/30" />
								<span className="text-[10px] font-medium uppercase tracking-widest text-fd-muted-foreground">
									Explore
								</span>
							</div>
						</div>

						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-fd-muted/50 transition-colors group-hover:bg-fd-primary/10">
							<ExternalLink className="h-4 w-4 text-fd-muted-foreground/40 transition-all group-hover:text-fd-primary" />
						</div>
					</motion.a>
				);
			})}
		</div>
	);
}
