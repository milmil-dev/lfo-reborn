import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useMediaStore } from "@/lib/media-store";

// Register lite-youtube-embed custom element (client-only — uses HTMLElement)
if (typeof window !== "undefined") {
  import("lite-youtube-embed");
}
import "lite-youtube-embed/src/lite-yt-embed.css";

interface VideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return m?.[1] ?? null;
}

function extractBilibiliId(url: string): string | null {
  const m = url.match(/bilibili\.com\/video\/(BV\w+)/);
  return m?.[1] ?? null;
}

export function VideoPlayer({ src, title, poster }: VideoPlayerProps) {
  const [activated, setActivated] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const themeColor = useMediaStore((s) => s.themeColor);
  const onVideoPlay = useMediaStore((s) => s.onVideoPlay);
  const onVideoPause = useMediaStore((s) => s.onVideoPause);

  const youtubeId = extractYouTubeId(src);
  const bilibiliId = extractBilibiliId(src);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        onVideoPause();
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [onVideoPause]);

  useEffect(() => {
    if (!activated || !videoRef.current || playerRef.current) return;

    import("video.js").then(({ default: videojs }) => {
      const player = videojs(videoRef.current!, {
        controls: true,
        autoplay: true,
        preload: "auto",
        fluid: true,
        aspectRatio: "16:9",
      });
      playerRef.current = player;
      player.addClass("vjs-wiki");
      player.on("play", onVideoPlay);
      player.on("pause", onVideoPause);
      player.on("ended", onVideoPause);
    });
  }, [activated, onVideoPlay, onVideoPause]);

  if (youtubeId) {
    return (
      <div className="my-4">
        <div className="overflow-hidden rounded-[2rem] border border-fd-border/40 shadow-lg" style={{ "--media-accent": themeColor } as React.CSSProperties}>
          <lite-youtube videoid={youtubeId} playlabel={title ?? "Play video"} />
        </div>
        {title && <p className="mt-2 text-sm text-fd-muted-foreground">{title}</p>}
      </div>
    );
  }

  if (bilibiliId) {
    return (
      <div className="my-4">
        <div className="aspect-video overflow-hidden rounded-[2rem] border border-fd-border/40 shadow-lg">
          <iframe
            src={`https://player.bilibili.com/player.html?bvid=${bilibiliId}&autoplay=0`}
            className="h-full w-full"
            allowFullScreen
            title={title ?? "Bilibili video"}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
        {title && <p className="mt-2 text-sm text-fd-muted-foreground">{title}</p>}
        <p className="mt-1 text-xs text-fd-muted-foreground/50">
          <a href={src} target="_blank" rel="noopener noreferrer">在Bilibili上觀看</a>
        </p>
      </div>
    );
  }

  return (
    <div className="my-4">
      <div className="relative overflow-hidden rounded-[2rem] border border-fd-border/40 shadow-lg" style={{ "--media-accent": themeColor } as React.CSSProperties}>
        {!activated ? (
          <div className="relative aspect-video cursor-pointer bg-black" onClick={() => setActivated(true)}>
            {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 backdrop-blur-sm">
                <Play className="h-6 w-6 text-white" fill="white" />
              </div>
            </div>
          </div>
        ) : (
          <div data-vjs-player>
            <video ref={videoRef} className="video-js vjs-wiki" playsInline>
              <source src={src} />
            </video>
          </div>
        )}
      </div>
      {title && <p className="mt-2 text-sm text-fd-muted-foreground">{title}</p>}
    </div>
  );
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-youtube": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        videoid: string;
        playlabel?: string;
      }, HTMLElement>;
    }
  }
}
