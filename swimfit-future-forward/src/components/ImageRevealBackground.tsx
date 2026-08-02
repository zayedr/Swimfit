import { BG_IMAGE_1, BG_VIDEO_JUMP } from "../lib/constants";

// Desktop hero background: a looping, autoplaying, muted video of the
// swimmer jumping — replaces the earlier canvas-driven mouse-spotlight
// image reveal per explicit request for real motion instead of a static
// photo. `poster` shows BG_IMAGE_1 (the video's own start frame) until the
// video itself has loaded, so there's never a blank flash.
export default function ImageRevealBackground() {
  return (
    <div
      className="hidden lg:block absolute inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      <video
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "center top" }}
        src={BG_VIDEO_JUMP}
        poster={BG_IMAGE_1}
        autoPlay
        muted
        loop
        playsInline
      />
    </div>
  );
}
