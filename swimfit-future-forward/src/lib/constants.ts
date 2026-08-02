// Always-visible background layer (desktop background + mobile static image).
// Swimmer wearing cap + goggles (worn correctly down over the eyes, not
// pushed up), fair skin/blue eyes/snow-white hair, pulled-back medium shot
// showing shoulders/upper chest (not a tight close-up), serious/non-smiling
// expression, full color, clean white studio backdrop, idealized/stylized
// features (not a real specific person) — the "before" state the mouse
// spotlight reveals out of. Generated via Higgsfield (text2image_soul_v2),
// hosted on the project's CloudFront bucket.
export const BG_IMAGE_1 =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_154900_d04a2d22-ad8b-4fe7-9cba-4bd4eba9b128.png";

// Revealed only inside the mouse spotlight mask (desktop interactive layer).
// Same swimmer with BOTH cap and goggles removed, revealing snow-white hair
// and blue eyes, now smiling — the "after" state under the spotlight.
// Generated via Higgsfield (nano_banana_2), edited from BG_IMAGE_1 as the
// reference image so it's the same person/lighting/background with the
// cap+goggles removed and expression changed to a smile.
export const BG_IMAGE_2 =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_154924_a3efb974-b2e9-4c40-a096-28abad6a09c5.png";

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
