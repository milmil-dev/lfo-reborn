import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export const SCREEN = { w: 800, h: 600 };

/** Current scale of the 800 × 600 original-resolution screen inside the viewport (contain). */
export function useScreenScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(innerWidth / SCREEN.w, innerHeight / SCREEN.h));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return scale;
}

/**
 * The original client ran at 800 × 600: its UI art is laid out in those pixels.
 * Children are positioned in that space; the whole screen scales to fit and stays centred.
 */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  const scale = useScreenScale();
  return (
    <div
      className={cn("absolute top-1/2 left-1/2 overflow-hidden", className)}
      style={{
        width: SCREEN.w,
        height: SCREEN.h,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}
