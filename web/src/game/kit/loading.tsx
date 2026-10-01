import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useHudScale } from "@/game/story/hud";
import { Ui } from "./ui";

/*
  The client's loading screen (loading/): the LITTLE FIGHTER ONLINE ring with LOADING in its
  middle (bigloading, 496 × 496) breathing at the centre of a black screen, and one of the five public-service slogans
  (slogan_a–e, 512 × 256: a scene from the cast with its line) in the bottom-right corner.
*/

const SLOGANS = ["a", "b", "c", "d", "e"] as const;

export function LoadingScreen({ show }: { show: boolean }) {
  const scale = useHudScale();
  const still = useReducedMotion();
  const [slogan] = useState(() => SLOGANS[Math.floor(Math.random() * SLOGANS.length)]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="loading"
          className="pointer-events-none fixed inset-0 z-40 bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          role="status"
          aria-label="Loading"
        >
          <div
            className="absolute top-1/2 left-1/2"
            style={{ transform: `translate(-50%, -60%) scale(${scale * 0.45})` }}
          >
            <motion.div
              animate={
                still ? { opacity: 0.9 } : { opacity: [0.45, 1, 0.45], scale: [0.98, 1, 0.98] }
              }
              transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            >
              <Ui name="loading/bigloading" w={496} h={496} />
            </motion.div>
          </div>
          <div
            className="absolute right-0 bottom-0"
            style={{ transform: `scale(${scale})`, transformOrigin: "bottom right" }}
          >
            <Ui name={`loading/slogan_${slogan}`} w={512} h={256} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
