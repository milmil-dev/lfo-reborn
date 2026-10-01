import { AnimatePresence, motion, useMotionValue } from "motion/react";
import { type ReactNode, useRef } from "react";

/**
 * A game window (出招表, 背包 …): opens in the middle of the screen, dragged by any part of its
 * frame, kept inside the screen, and remembers where it was left while it is closed.
 */
export function FloatingPanel({
  open,
  scale = 1,
  children,
}: {
  open: boolean;
  scale?: number;
  children: ReactNode;
}) {
  const area = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  return (
    <div ref={area} className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <AnimatePresence>
        {open && (
          <motion.div
            drag
            dragConstraints={area}
            dragMomentum={false}
            dragElastic={0}
            className="pointer-events-auto cursor-grab active:cursor-grabbing"
            style={{ x, y, scale }}
            initial={{ opacity: 0, scale: scale * 0.9 }}
            animate={{ opacity: 1, scale }}
            exit={{ opacity: 0, scale: scale * 0.9 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
