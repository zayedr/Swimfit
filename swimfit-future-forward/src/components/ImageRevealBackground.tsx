import { useEffect, useRef } from "react";
import { BG_IMAGE_1, BG_IMAGE_2 } from "../lib/constants";

// Full-viewport background: BG_IMAGE_1 sits underneath always (goggles on);
// BG_IMAGE_2 (goggles off, hair loose) is drawn on a canvas and clipped
// ("destination-in" composite) to a soft circular radial-gradient mask that
// follows the mouse, smoothly eased (lerp factor 0.16) toward the pointer
// every animation frame — so the second layer only ever shows through a
// spotlight strictly under the cursor.
const EASE = 0.16;
const SPOTLIGHT_RADIUS = 220;

export default function ImageRevealBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = BG_IMAGE_2;
    imgRef.current = img;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Target = raw pointer position (container-relative px); eased = the
    // smoothed value actually used to draw, updated at EASE per frame.
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    let hasPointer = false;

    function resize() {
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (!hasPointer) {
        target.x = width / 2;
        target.y = height / 2;
        eased.x = target.x;
        eased.y = target.y;
      }
    }

    function handlePointerMove(e: PointerEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      target.x = e.clientX - rect.left;
      target.y = e.clientY - rect.top;
      hasPointer = true;
    }

    function handlePointerLeave() {
      hasPointer = false;
      target.x = width / 2;
      target.y = height / 2;
    }

    // Cover-fit math for drawing BG_IMAGE_2, mirroring CSS
    // background-size:cover; background-position:center.
    function drawCoverImage() {
      if (!ctx || !img.naturalWidth || !img.naturalHeight) return;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = width / height;
      let drawW: number;
      let drawH: number;
      if (imgRatio > boxRatio) {
        drawH = height;
        drawW = height * imgRatio;
      } else {
        drawW = width;
        drawH = width / imgRatio;
      }
      const dx = (width - drawW) / 2;
      const dy = (height - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    let rafId = 0;
    function tick() {
      eased.x += (target.x - eased.x) * EASE;
      eased.y += (target.y - eased.y) * EASE;

      if (ctx && width > 0 && height > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
        if (img.complete && img.naturalWidth) {
          drawCoverImage();
        }
        // Punch the spotlight: keep only pixels inside the radial gradient's
        // opaque center, fade to fully transparent at SPOTLIGHT_RADIUS.
        ctx.globalCompositeOperation = "destination-in";
        const gradient = ctx.createRadialGradient(
          eased.x,
          eased.y,
          0,
          eased.x,
          eased.y,
          SPOTLIGHT_RADIUS,
        );
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.7, "rgba(255,255,255,0.55)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }

      rafId = requestAnimationFrame(tick);
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Base layer — goggles on, always visible. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${BG_IMAGE_1})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* Canvas-driven spotlight reveal of BG_IMAGE_2 (goggles off). */}
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
