// Always-visible background layer (desktop background + mobile static image).
export const BG_IMAGE_1 =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260802_074534_f0d9d476-3f86-4c67-9b12-dfc63d99da41.png&w=1920&q=85";

// Revealed only inside the mouse spotlight mask (desktop interactive layer).
export const BG_IMAGE_2 =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260802_075145_1b557479-775b-43af-8270-f45d79d97d5a.png&w=1920&q=85";

export interface WorkoutItem {
  tag: string;
  title: string;
  price: string;
}

export interface GymItem {
  series: string;
  title: string;
  description: string;
}

export interface TrackerItem {
  date: string;
  title: string;
  status: string;
}

export interface PricingItem {
  tier: string;
  price: string;
  period: string;
  features: string[];
  featured?: boolean;
}

// Real content pulled from swimfit.online's own Workout Generator — the
// Weekly Training Schedule's daily focus rotation (WEEKLY_FOCUS in
// js/workout-generator.js), not placeholder plan names.
export const WORKOUTS_CONTENT = {
  title: "Swim Workout Generator",
  subtitle: "Build Your Own",
  items: [
    { tag: "DAILY FOCUS", title: "SPRINT & POWER", price: "Speed Focus" },
    { tag: "DAILY FOCUS", title: "AEROBIC & DISTANCE", price: "Endurance Focus" },
    { tag: "DAILY FOCUS", title: "TECHNIQUE & DRILLS", price: "Technique Focus" },
    { tag: "DAILY FOCUS", title: "RACE PACE", price: "Race Prep" },
  ] as WorkoutItem[],
};

// Real content: the three focuses in the Gym tab's own auto-rotating weekly
// cycle (GYM_WEEKLY_ROTATION = ['upper','lower','full']), described with the
// real commercial equipment documented for each focus.
export const GYM_CONTENT = {
  title: "What Are You Training Today?",
  subtitle: "Dryland & Strength",
  items: [
    {
      series: "GYM FOCUS",
      title: "UPPER BODY",
      description:
        "Lat pulldowns, incline bench press, cable rows and weighted pull-ups — real commercial gym equipment.",
    },
    {
      series: "GYM FOCUS",
      title: "LOWER BODY",
      description:
        "Barbell squats, Romanian deadlifts, leg press and Bulgarian split squats.",
    },
    {
      series: "GYM FOCUS",
      title: "FULL BODY",
      description:
        "Barbell strength work rotating through squat, hinge, press and pull patterns.",
    },
  ] as GymItem[],
};

// Real content: the actual exercise line-up per Gym Focus, matching the main
// site's real-commercial-equipment rewrite (js/workout-generator.js's
// GYM_FOCUS data) — used by the full Gym page's exercise board.
export const GYM_FOCUS_EXERCISES: Record<string, { name: string; prescription: string }[]> = {
  "UPPER BODY": [
    { name: "Lat Pulldown", prescription: "4 x 10" },
    { name: "Incline Bench Press", prescription: "4 x 8" },
    { name: "Cable Face Pull", prescription: "3 x 15" },
    { name: "Seated Cable Row", prescription: "4 x 10" },
    { name: "Weighted Pull-Up", prescription: "3 x 6" },
    { name: "Cable Tricep Pushdown", prescription: "3 x 12" },
  ],
  "LOWER BODY": [
    { name: "Barbell Squat", prescription: "4 x 8" },
    { name: "Romanian Deadlift", prescription: "4 x 8" },
    { name: "Leg Press", prescription: "3 x 12" },
    { name: "Hamstring Curl Machine", prescription: "3 x 12" },
    { name: "Bulgarian Split Squat", prescription: "3 x 10 / leg" },
    { name: "Standing Calf Raise", prescription: "3 x 15" },
  ],
  "FULL BODY": [
    { name: "Barbell Squat", prescription: "4 x 6" },
    { name: "Barbell Bench Press", prescription: "4 x 6" },
    { name: "Deadlift", prescription: "3 x 5" },
    { name: "Pull-Up", prescription: "3 x AMRAP" },
    { name: "Overhead Press", prescription: "3 x 8" },
    { name: "Cable Woodchopper", prescription: "3 x 12 / side" },
  ],
};

// Real content: the Distance Tracker's own actual analytics features, not a
// fabricated sample of someone's personal logbook.
export const TRACKER_CONTENT = {
  title: "Log Your Swims, Watch The Volume Add Up",
  subtitle: "Distance Tracker",
  items: [
    {
      date: "TOTALS",
      title: "DAILY / WEEKLY / MONTHLY",
      status: "AUTO-TRACKED",
    },
    {
      date: "ANALYTICS",
      title: "AVG PACE & EST. CALORIES",
      status: "COMPUTED",
    },
    {
      date: "PERSONAL BESTS",
      title: "PER STROKE & DISTANCE",
      status: "RECORD ALERTS",
    },
  ] as TrackerItem[],
};

// Real content: the three actual Pro/Elite/Ultra membership tiers from the
// live Pricing tab.
export const PRICING_CONTENT = {
  title: "Simple Pricing, Serious Results",
  subtitle: "Membership",
  items: [
    {
      tier: "Pro",
      price: "$13",
      period: "per month",
      features: ["Beginner & Competitive swim tracks", "Full Gym Focus access", "Distance Tracker"],
    },
    {
      tier: "Elite",
      price: "$21",
      period: "per month",
      features: ["Everything unlocked", "Elite swim tracks", "Full-screen AI Coach"],
      featured: true,
    },
    {
      tier: "Ultra",
      price: "$135",
      period: "per year",
      features: ["Everything in Elite", "2 months free annually", "Early access to new tracks"],
    },
  ] as PricingItem[],
};
