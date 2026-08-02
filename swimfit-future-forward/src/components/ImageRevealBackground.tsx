import { useEffect, useRef } from "react";
import { BG_IMAGE_1, BG_IMAGE_2 } from "../lib/constants";

// Desktop-only interactive background: BG_IMAGE_1 sits underneath always;
// BG_IMAGE_2 is drawn on a canvas and clipped ("destination-in" composite)
// to a soft circular radial-gradient mask that follows the mouse, smoothly
// eased (lerp factor 0.1) toward the pointer every animation frame — so the
// second image only ever shows through a gentle spotlight. A faint slate
// line-grid layer drifts in parallax with the same eased pointer position,
// offset by (easedX * 16 * 0.06, easedY * 16 * 0.06) so it reads as subtle
// depth rather than a distracting motion.
const EASE = 0.1;
const PARALLAX_AMPLITUDE = 16;
const PARALLAX_FACTOR = 0.06;
const SPOTLIGHT_RADIUS = 260;

export default function ImageRevealBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
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
      target.x = width / 2;
      target.y = height / 2;
    }

    // Cover-fit math for drawing BG_IMAGE_2, mirroring CSS
    // background-size:cover; background-position:center top — vertical
    // cropping (when the box is taller/narrower than the image) is anchored
    // to the top so the subject's face/head is never cut off, only the area
    // below it.
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
      // Only the imgRatio <= boxRatio branch ever produces vertical overflow
      // (drawH > height); anchor that overflow to the top instead of
      // centering it. The other branch already has drawH === height, so dy
      // is 0 either way.
      const dy = imgRatio <= boxRatio ? 0 : (height - drawH) / 2;
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
        gradient.addColorStop(0.7, "rgba(255,255,255,0.6)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }

      if (gridRef.current && width > 0 && height > 0) {
        const cx = (eased.x - width / 2) / (width / 2);
        const cy = (eased.y - height / 2) / (height / 2);
        const offsetX = cx * PARALLAX_AMPLITUDE * PARALLAX_FACTOR;
        const offsetY = cy * PARALLAX_AMPLITUDE * PARALLAX_FACTOR;
        gridRef.current.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
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
      className="hidden lg:block absolute inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Base layer — always visible. grayscale(100%) is a pure post-render
          CSS filter guaranteeing strictly black-and-white output regardless
          of any subtle color cast in the source photo; it's a post-render
          filter on this div's own rasterized output, so it never touches the
          canvas layer's internal drawImage/composite operations below.
          background-position is top-anchored so a taller/narrower viewport
          never crops the swimmer's face, only the space below it. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${BG_IMAGE_1})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          filter: "grayscale(100%)",
        }}
      />
      {/* Parallax blueprint grid, drifting gently with the eased pointer. */}
      <div
        ref={gridRef}
        className="absolute inset-[-5%]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(100,116,139,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.12) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Canvas-driven spotlight reveal of BG_IMAGE_2. grayscale(100%) here
          is applied to the canvas ELEMENT's own rasterized output, after all
          internal drawImage/destination-in compositing has already happened
          — it desaturates the visible pixels without touching the alpha
          mask, so the spotlight reveal itself is completely unaffected. */}
      <canvas ref={canvasRef} className="absolute inset-0" style={{ filter: "grayscale(100%)" }} />
    </div>
  );
}
