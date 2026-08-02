// Always-visible background layer (desktop background + mobile static image).
// Swimmer wearing cap + goggles worn correctly down directly over the eyes
// (not pushed up on the forehead), fair skin/blue eyes/long snow-white hair,
// a wide pulled-back shot with generous empty margin around his head/
// shoulders so the face and hair are never cropped, serious/non-smiling
// expression, full color, clean white studio backdrop, idealized/stylized
// features (not a real specific person) — the "before" state the mouse
// spotlight reveals out of. Generated via Higgsfield (text2image_soul_v2),
// hosted on the project's CloudFront bucket.
export const BG_IMAGE_1 =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_155457_88f63344-2f61-4b5e-bf57-0a8dd96eee5f.png";

// Revealed only inside the mouse spotlight mask (desktop interactive layer).
// Same swimmer with BOTH cap and goggles removed, revealing long snow-white
// hair and blue eyes, expression kept serious/non-smiling (matching
// BG_IMAGE_1) — the "after" state under the spotlight. Generated via
// Higgsfield (nano_banana_2), edited from BG_IMAGE_1 as the reference image
// so it's the same person/lighting/background with only the cap+goggles
// removed.
export const BG_IMAGE_2 =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_155525_192705f7-6cb4-41eb-ae0e-7dd29193b991.png";

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
