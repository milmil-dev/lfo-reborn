import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UI_HD, uiUrl } from "@/game/kit/ui";
import { cn } from "@/lib/cn";
import { ASSETS } from "@/lib/assets";

export const Route = createFileRoute("/play/kit")({ component: Kit });

/*
  UI kit review sheet: every piece as the original bitmap next to its 4× HD version
  (pipeline/ui-hd.ts), or stacked as an onion skin, at 1×, 2× or 4×. For checking fidelity.
*/

const manifest = queryOptions({
  queryKey: ["ui-hd", "manifest"],
  queryFn: () =>
    fetch(`${UI_HD}/manifest.json`).then(
      (r) => r.json() as Promise<Record<string, [number, number]>>,
    ),
  staleTime: Number.POSITIVE_INFINITY,
});

function Kit() {
  const { data = {} } = useQuery(manifest);
  const [zoom, setZoom] = useState(2);
  const [mode, setMode] = useState<"side" | "onion">("side");
  const [filter, setFilter] = useState("");
  const names = Object.keys(data)
    .filter((n) => n.includes(filter))
    .sort();
  return (
    <div className="min-h-dvh bg-[#0b0d12] p-6 text-foreground">
      <header className="sticky top-0 z-10 -mx-6 mb-6 flex flex-wrap items-center gap-3 bg-[#0b0d12]/90 px-6 py-3 backdrop-blur">
        <h1 className="font-lfo text-xl">LFO UI KIT</h1>
        <p className="text-sm text-white/55">
          {names.length} 件 ·{" "}
          {mode === "side" ? "左：原版點陣圖　右：AI 4× 高清版" : "疊圖：高清版以 50% 疊在原版上"}
        </p>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="篩選，例如 chatpanel"
          className="ml-auto rounded-full bg-white/10 px-3 py-1 text-sm outline-none"
        />
        {[1, 2, 4].map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              zoom === z ? "bg-white text-black" : "bg-white/10",
            )}
          >
            {z}×
          </button>
        ))}
        {(["side", "onion"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              mode === m ? "bg-white text-black" : "bg-white/10",
            )}
          >
            {m === "side" ? "並排" : "疊圖"}
          </button>
        ))}
      </header>
      <div className="flex flex-wrap items-start gap-4">
        {names.map((n) => {
          const [w, h] = data[n];
          const size = { width: w * zoom, height: h * zoom };
          return (
            <figure key={n} className="rounded-xl bg-white/5 p-3">
              <figcaption className="mb-2 font-mono text-white/60 text-xs">
                {n}{" "}
                <span className="text-white/35">
                  {w}×{h}
                </span>
              </figcaption>
              {mode === "side" ? (
                <div className="flex gap-3">
                  <img
                    src={`${ASSETS}/ui/${n}.png`}
                    alt=""
                    style={size}
                    className="max-w-none bg-[#556072] [image-rendering:pixelated]"
                  />
                  <img src={uiUrl(n)} alt="" style={size} className="max-w-none bg-[#556072]" />
                </div>
              ) : (
                <div className="relative bg-[#556072]" style={size}>
                  <img
                    src={`${ASSETS}/ui/${n}.png`}
                    alt=""
                    style={{ ...size, imageRendering: "pixelated" }}
                    className="absolute inset-0 max-w-none"
                  />
                  <img
                    src={uiUrl(n)}
                    alt=""
                    style={size}
                    className="absolute inset-0 max-w-none opacity-50"
                  />
                </div>
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
