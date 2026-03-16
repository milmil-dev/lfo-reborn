import { Link } from "@tanstack/react-router";
import { motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CharacterHoverCardProvider } from "@/components/character-hover-card";
import { CharacterIcon } from "@/components/character-icon";
import { characters, versionDates } from "@/lib/characters";

const versionColors = [
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#f97316",
	"#a855f7",
	"#3b82f6",
	"#14b8a6",
	"#22c55e",
	"#06b6d4",
	"#f43f5e",
	"#6366f1",
	"#d946ef",
	"#84cc16",
	"#0ea5e9",
	"#eab308",
	"#10b981",
	"#e11d48",
	"#7c3aed",
] as const;

/**
 * Build gradient stops based on actual measured section heights.
 * Each section gets its color for exactly its proportion of the total.
 */
function buildGradientFromHeights(
	sections: { top: number; height: number; color: string }[],
	totalHeight: number,
) {
	if (totalHeight === 0) return "transparent";
	const stops: string[] = [];
	for (const s of sections) {
		const startPct = (s.top / totalHeight) * 100;
		const endPct = ((s.top + s.height) / totalHeight) * 100;
		stops.push(`${s.color} ${startPct}%`, `${s.color} ${endPct}%`);
	}
	return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

export function TimelineWrapper({ children }: { children: ReactNode }) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const innerRef = useRef<HTMLDivElement>(null);
	const [gradient, setGradient] = useState("transparent");
	const [spineEnd, setSpineEnd] = useState("100%");

	const { scrollYProgress } = useScroll({
		target: wrapperRef,
		offset: ["start center", "end end"],
	});
	const smooth = useSpring(scrollYProgress, {
		stiffness: 80,
		damping: 25,
		restDelta: 0.001,
	});
	const clipPath = useTransform(smooth, (v) => `inset(0 0 ${(1 - v) * 100}% 0)`);

	// Measure actual section heights after mount to build accurate gradient
	useEffect(() => {
		const inner = innerRef.current;
		if (!inner) return;

		const measure = () => {
			const totalHeight = inner.offsetHeight;
			const sectionEls = inner.querySelectorAll<HTMLElement>(":scope > .timeline-section");
			const sections: { top: number; height: number; color: string }[] = [];
			sectionEls.forEach((el, i) => {
				sections.push({
					top: el.offsetTop,
					height: el.offsetHeight,
					color: versionColors[i % versionColors.length],
				});
			});
			setGradient(buildGradientFromHeights(sections, totalHeight));
			// Spine ends at the bottom of the last section
			const lastSection = sectionEls[sectionEls.length - 1];
			if (lastSection) {
				setSpineEnd(`${lastSection.offsetTop + lastSection.offsetHeight}px`);
			}
		};

		measure();
		// Re-measure on resize
		const observer = new ResizeObserver(measure);
		observer.observe(inner);
		return () => observer.disconnect();
	}, []);

	return (
		<CharacterHoverCardProvider>
			<div ref={wrapperRef} className="not-prose relative pl-10">
				{/* Background spine — ends at last circle center */}
				<div className="absolute left-4 top-0 w-0.5 bg-fd-border" style={{ height: spineEnd }} />
				{/* Active spine — single line that grows from top, color changes per section */}
				<motion.div
					className="absolute top-0 w-1 rounded-full"
					style={{
						left: "calc(1rem - 1px)",
						height: spineEnd,
						background: gradient,
						clipPath,
					}}
				/>
				{/* End dot at the bottom of the spine */}
				<div
					className="absolute z-10"
					style={{ left: "calc(1rem + 1px)", top: spineEnd, transform: "translate(-50%, -50%)" }}
				>
					<div
						className="h-2.5 w-2.5 rounded-full"
						style={{ backgroundColor: versionColors[18 % versionColors.length] }}
					/>
				</div>
				<div ref={innerRef} className="timeline-wrapper relative">
					{children}
				</div>
			</div>
		</CharacterHoverCardProvider>
	);
}

export function TimelineSection({
	version,
	index = 0,
	isLast = false,
}: {
	version: string;
	index?: number;
	isLast?: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-60px" });
	const chars = characters.filter((c) => c.version === version);
	const accentColor = versionColors[index % versionColors.length];

	if (chars.length === 0) return null;

	const versionNum = version.match(/v[\d.]+/)?.[0] ?? version;
	const versionTitle = version.replace(/v[\d.]+\s*/, "");
	const date = versionDates[version];
	// Extract year from date like "2004.10.22" → "2004"
	const year = date?.split(".")[0];

	return (
		<div ref={ref} className={`timeline-section not-prose relative ${isLast ? "" : "pb-10"}`}>
			{/* Node circle on the spine */}
			<motion.div
				className="group/circle absolute top-0 z-20 cursor-pointer"
				style={{ left: "calc(1rem + 1px - 20px - 2.5rem)" }}
				initial={{ scale: 0 }}
				animate={isInView ? { scale: 1 } : { scale: 0 }}
				transition={{ duration: 0.4, type: "spring", stiffness: 250, damping: 15 }}
			>
				<div
					className="flex h-10 w-10 items-center justify-center rounded-full bg-fd-background transition-shadow duration-200 group-hover/circle:scale-110"
					style={{
						border: `3px solid ${accentColor}`,
						boxShadow: `0 0 0 3px var(--color-fd-background), 0 0 12px ${accentColor}30`,
					}}
				>
					<span
						className="text-[9px] font-bold leading-none group-hover/circle:hidden"
						style={{ color: accentColor }}
					>
						{year ?? chars.length}
					</span>
					<span
						className="hidden text-[9px] font-bold leading-none group-hover/circle:inline"
						style={{ color: accentColor }}
					>
						+{chars.length}
					</span>
				</div>
			</motion.div>

			{/* Content */}
			<motion.div
				initial={{ opacity: 0, x: -30 }}
				animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
				transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
			>
				{/* Version label */}
				<div className="mb-1 ml-2 flex items-baseline gap-2">
					<span className="text-sm font-bold" style={{ color: accentColor }}>
						{versionNum}
					</span>
					<motion.h4
						className="text-base font-bold"
						initial={{ opacity: 0 }}
						animate={isInView ? { opacity: 1 } : { opacity: 0 }}
						transition={{ duration: 0.3, delay: 0.3 }}
					>
						<Link
							to="/docs/good/news"
							className="transition-opacity hover:opacity-70"
							style={{ color: accentColor }}
						>
							{versionTitle || version}
						</Link>
					</motion.h4>
					{date && (
						<span className="text-xs opacity-70" style={{ color: accentColor }}>
							{date}
						</span>
					)}
				</div>

				{/* Character icons */}
				<div className="ml-2 flex flex-wrap gap-1.5">
					{chars.map((char, ci) => (
						<motion.div
							key={char.slug}
							initial={{ opacity: 0, scale: 0.4, y: 8 }}
							animate={isInView ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.4, y: 8 }}
							transition={{
								duration: 0.3,
								delay: 0.25 + ci * 0.03,
								type: "spring",
								stiffness: 280,
								damping: 22,
							}}
						>
							<CharacterIcon char={char} size="sm" />
						</motion.div>
					))}
				</div>
			</motion.div>
		</div>
	);
}
