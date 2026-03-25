import { Wand2 } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

interface HoverState {
	name: string;
	demo: string;
	rect: DOMRect;
}

interface ItemHoverCardContextValue {
	show: (name: string, demo: string, rect: DOMRect) => void;
	hide: () => void;
}

const ItemHoverCardContext = createContext<ItemHoverCardContextValue | null>(null);

export function useItemHoverCard() {
	const ctx = useContext(ItemHoverCardContext);
	if (!ctx) throw new Error("useItemHoverCard must be used within ItemHoverCardProvider");
	return ctx;
}

export function ItemHoverCardProvider({ children }: { children: ReactNode }) {
	const [hover, setHover] = useState<HoverState | null>(null);
	const [visible, setVisible] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

	const show = useCallback((name: string, demo: string, rect: DOMRect) => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setHover({ name, demo, rect });
		setVisible(true);
	}, []);

	const hide = useCallback(() => {
		timeoutRef.current = setTimeout(() => {
			setVisible(false);
			setTimeout(() => setHover(null), 200);
		}, 150);
	}, []);

	const cancelHide = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
	}, []);

	return (
		<ItemHoverCardContext value={{ show, hide }}>
			{children}
			<AnimatePresence>
				{visible && hover && (
					<HoverCardShell hover={hover} onMouseEnter={cancelHide} onMouseLeave={hide} />
				)}
			</AnimatePresence>
		</ItemHoverCardContext>
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
	const { name, demo, rect } = hover;
	const cardWidth = 320;
	const gap = 16;

	// Calculate target position
	let targetLeft = rect.right + gap;
	let targetTop = rect.top + rect.height / 2 - 100;

	// Flip to left if no space on right
	if (typeof window !== "undefined") {
		if (targetLeft + cardWidth > window.innerWidth - 20) {
			targetLeft = rect.left - cardWidth - gap;
		}
		// Clamp vertical
		targetTop = Math.max(80, Math.min(targetTop, window.innerHeight - 250));
	}

	const x = useSpring(useMotionValue(targetLeft), springConfig);
	const y = useSpring(useMotionValue(targetTop), springConfig);

	useEffect(() => {
		x.set(targetLeft);
		y.set(targetTop);
	}, [targetLeft, targetTop, x, y]);

	return (
		<motion.div
			className="pointer-events-auto fixed z-[100]"
			style={{
				x,
				y,
				width: cardWidth,
				left: 0,
				top: 0,
			}}
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.95 }}
			transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div className="relative overflow-hidden rounded-2xl border border-fd-primary/30 bg-fd-card/95 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(var(--primary),0.1)] backdrop-blur-md">
				<div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/40">
					<img src={demo} alt="Demo" className="h-full w-full object-contain" />
					<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 pt-10">
						<p className="font-sans text-sm font-bold text-white drop-shadow-md">
							{name} <span className="text-fd-primary/90 ml-1">— 動作示範</span>
						</p>
					</div>
				</div>
				<div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold tracking-widest text-fd-muted-foreground uppercase opacity-80 font-sans">
					<div className="flex items-center gap-1.5 text-fd-primary">
						<Wand2 className="h-3 w-3 animate-pulse" />
						<span>Live Preview</span>
					</div>
					<span className="text-[9px]">LFO Wiki Museum</span>
				</div>
			</div>
		</motion.div>
	);
}
