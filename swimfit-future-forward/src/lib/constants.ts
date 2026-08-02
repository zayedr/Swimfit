// Always-visible background layer (desktop background + mobile static image).
// Handsome European swimmer, striking icy-white platinum blonde hair fully
// tucked inside a professional swim cap, vibrant blue eyes, dark racing
// goggles worn directly over the eyes (not pushed up on the forehead),
// full rich color photography on a clean minimalist pure white seamless
// background, idealized/stylized features (not a real specific person) —
// the "before" state the mouse spotlight reveals out of. Generated via
// Higgsfield (text2image_soul_v2), hosted on the project's CloudFront
// bucket.
export const BG_IMAGE_1 =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_160823_5a9d4bf5-e7b7-4ac0-8872-1926e9e0862d.png";

// Revealed only inside the mouse spotlight mask (desktop interactive layer).
// Same swimmer, same icy-white hair and blue eyes, same pure white
// background, same full color treatment — but with the goggles removed and
// his medium-length hair loose/flowing out from under the cap instead of
// tucked inside, revealing his focused bare eyes — the "after" state under
// the spotlight. Generated via Higgsfield (nano_banana_2), edited from
// BG_IMAGE_1 as the reference image so it's the same person/lighting/
// background/cap with only the goggles removed and the hair let out.
export const BG_IMAGE_2 =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3FJRlsOkiGfEhuOCKyFRAVy6XeE/hf_20260802_160904_1b5c5657-11b2-4602-897e-a7ad179923f0.png";

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
