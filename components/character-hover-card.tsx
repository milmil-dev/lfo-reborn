import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import type { Character } from "@/lib/characters";
import { getCharacterProfileImage } from "@/lib/characters";
import { useCharacterStore } from "@/lib/store";

interface HoverState {
	char: Character;
	rect: DOMRect;
}

interface HoverCardContextValue {
	show: (char: Character, rect: DOMRect) => void;
	hide: () => void;
}

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

export function useCharacterHoverCard() {
	const ctx = useContext(HoverCardContext);
	if (!ctx) throw new Error("useCharacterHoverCard must be used within CharacterHoverCardProvider");
	return ctx;
}

export function CharacterHoverCardProvider({ children }: { children: ReactNode }) {
	const [hover, setHover] = useState<HoverState | null>(null);
	const [visible, setVisible] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

	const show = useCallback((char: Character, rect: DOMRect) => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setHover({ char, rect });
		setVisible(true);
	}, []);

	const hide = useCallback(() => {
		timeoutRef.current = setTimeout(() => {
			setVisible(false);
			// Clear hover data after exit animation
			setTimeout(() => setHover(null), 200);
		}, 150);
	}, []);

	const cancelHide = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
	}, []);

	return (
		<HoverCardContext value={{ show, hide }}>
			{children}
			<AnimatePresence>
				{visible && hover && (
					<HoverCardShell hover={hover} onMouseEnter={cancelHide} onMouseLeave={hide} />
				)}
			</AnimatePresence>
		</HoverCardContext>
	);
}

const springConfig = { stiffness: 300, damping: 30, mass: 0.8 };

function HoverCardShell({
	hover,
	onMouseEnter,
	onMouseLeave,
}: {
	hover: HoverState;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
}) {
	const { char, rect } = hover;
	const storedChar = useCharacterStore((s) => s.getCharacter(char.slug));
	const description = storedChar?.description;
	const profileSrc = getCharacterProfileImage(char.slug);

	const cardWidth = 240;
	const gap = 8;

	let left = rect.left + rect.width / 2 - cardWidth / 2;
	left = Math.max(8, Math.min(left, window.innerWidth - cardWidth - 8));

	const spaceAbove = rect.top;
	const positionAbove = spaceAbove > 260;

	const targetTop = positionAbove ? undefined : rect.bottom + gap;
	const targetBottom = positionAbove ? window.innerHeight - rect.top + gap : undefined;

	// Smooth position springs
	const x = useSpring(useMotionValue(left), springConfig);
	x.set(left);

	const topSpring = useSpring(useMotionValue(targetTop ?? 0), springConfig);
	if (targetTop !== undefined) topSpring.set(targetTop);

	const bottomSpring = useSpring(useMotionValue(targetBottom ?? 0), springConfig);
	if (targetBottom !== undefined) bottomSpring.set(targetBottom);

	return (
		<motion.div
			className="pointer-events-auto fixed z-50"
			style={{
				x,
				top: positionAbove ? undefined : topSpring,
				bottom: positionAbove ? bottomSpring : undefined,
				width: cardWidth,
				left: 0,
			}}
			initial={{ opacity: 0, scale: 0.92 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.92 }}
			transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<motion.div
				className="relative overflow-hidden rounded-xl border bg-fd-popover"
				animate={{
					borderColor: `${char.color}20`,
					boxShadow: `0 4px 24px ${char.color}12, 0 8px 32px rgba(0,0,0,0.15)`,
				}}
				transition={{ duration: 0.3 }}
			>
				{/* Top color glow */}
				<motion.div
					className="pointer-events-none absolute -top-8 left-1/2 h-16 w-32 -translate-x-1/2 rounded-full blur-2xl"
					animate={{ backgroundColor: `${char.color}18` }}
					transition={{ duration: 0.3 }}
				/>

				{/* Profile image — crossfade */}
				<div className="relative flex justify-center pt-3" style={{ minHeight: 180 }}>
					<AnimatePresence mode="popLayout">
						<motion.img
							key={char.slug}
							src={profileSrc}
							alt={char.name}
							className="relative z-10 h-44 w-auto object-contain drop-shadow-[0_3px_12px_rgba(0,0,0,0.3)]"
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9, position: "absolute" }}
							transition={{ duration: 0.2 }}
						/>
					</AnimatePresence>
					<motion.div
						className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-full blur-xl"
						animate={{ backgroundColor: `${char.color}25` }}
						transition={{ duration: 0.3 }}
					/>
				</div>

				{/* Info — crossfade */}
				<div className="relative px-3 pb-3 -mt-1">
					<AnimatePresence mode="popLayout">
						<motion.div
							key={char.slug}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4, position: "absolute" }}
							transition={{ duration: 0.18 }}
							className="w-full"
						>
							{/* Name */}
							<div className="text-center">
								<span className="text-sm font-bold tracking-tight" style={{ color: char.color }}>
									{char.name}
								</span>
							</div>

							{/* Description */}
							{description && (
								<p className="mt-1.5 text-center text-[11px] leading-[1.55] text-fd-muted-foreground line-clamp-2">
									{description}
								</p>
							)}
						</motion.div>
					</AnimatePresence>
				</div>
			</motion.div>
		</motion.div>
	);
}
