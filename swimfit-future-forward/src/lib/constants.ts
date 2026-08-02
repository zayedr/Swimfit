// Poster/fallback image shown before the hero video has loaded, and used as
// the plain background on very small viewports where autoplaying a large
// video isn't worth the bandwidth. Full-body, head-to-toe shot (nothing
// cropped) of a handsome European swimmer, snow-white hair tucked inside a
// professional swim cap, vibrant blue eyes, dark racing goggles worn
// directly over the eyes, full rich color photography on a clean pure white
// seamless background, standing upright facing the camera. Generated via
// Higgsfield (text2image_soul_v2), hosted on the project's CloudFront
// bucket. This is also the exact start frame the hero video (below) was
// animated from.
export const BG_IMAGE_1 =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_164050_744f4301-e4d8-444e-8f20-bf9ffab1e74b.png";

// Looping hero background video (desktop + mobile) — the same full-body
// swimmer from BG_IMAGE_1 taking an explosive, athletic jump on a clean
// white studio background, water droplets flying, full body always in
// frame. Replaces the earlier static two-image mouse-spotlight reveal
// entirely, per explicit request for real motion instead of a still photo.
// Generated via Higgsfield (kling3_0_turbo, image-to-video from
// BG_IMAGE_1 as the start frame), hosted on the project's CloudFront
// bucket.
export const BG_VIDEO_JUMP =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_164424_b1f8fe68-70ae-4ab8-9480-470d90a83e06.mp4";

export type DrawerKind = "workouts" | "dryland" | "tracker" | null;

export interface WorkoutItem {
  tag: string;
  title: string;
  price: string;
}

export interface DrylandItem {
  series: string;
  title: string;
  description: string;
}

export interface TrackerItem {
  date: string;
  title: string;
  status: string;
}

export const WORKOUTS_CONTENT = {
  title: "Swim Plans",
  subtitle: "Daily Water Sessions",
  items: [
    { tag: "ACTIVE", title: "SPRINT & POWER", price: "$0" },
    { tag: "ACTIVE", title: "ENDURANCE BASE", price: "$0" },
    { tag: "ACTIVE", title: "TECHNIQUE REFINEMENT", price: "$0" },
    { tag: "ACTIVE", title: "RECOVERY SWIM", price: "$0" },
  ] as WorkoutItem[],
};

export const DRYLAND_CONTENT = {
  title: "Gym & Core",
  subtitle: "Out of water training",
  items: [
    {
      series: "SERIES 01",
      title: "KINETIC CORE",
      description:
        "Ergonomic dryland designed for maximum stability in water.",
    },
    {
      series: "SERIES 02",
      title: "EXPLOSIVE POWER",
      description:
        "Heavy resistance training to improve block starts and turns.",
    },
    {
      series: "SERIES 03",
      title: "MOBILITY ZERO",
      description:
        "Pure flexibility routines crafted for shoulder longevity.",
    },
  ] as DrylandItem[],
};

export const TRACKER_CONTENT = {
  title: "Performance",
  subtitle: "Latest Metrics",
  items: [
    {
      date: "AUG 2026",
      title: "100M FREESTYLE TIME TRIAL",
      status: "PB ACHIEVED",
    },
    {
      date: "JUL 2026",
      title: "TOTAL WEEKLY DISTANCE: 15KM",
      status: "+2KM",
    },
    {
      date: "JUN 2026",
      title: "STROKE EFFICIENCY ANALYSIS",
      status: "IMPROVED",
    },
  ] as TrackerItem[],
};
