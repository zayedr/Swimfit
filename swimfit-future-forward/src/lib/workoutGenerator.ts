// A lighter-weight, TypeScript-native re-implementation of the real site's
// Workout Generator (js/workout-generator.js) — same 4-stage structure
// (Warm-Up / Pre-Set / Main Set / Cool-Down), same day-stable rotation
// concept, and the same "Warm-Up always opens Freestyle" rule, but drawing
// from a smaller archetype pool than the ~500-line original. This is a
// deliberate, disclosed scope trim for the future-forward rebuild's first
// pass — porting the full archetype library is a follow-up task, not done
// here.

export type Discipline = "Freestyle" | "Backstroke" | "Butterfly" | "Breaststroke" | "Individual Medley";
export type Goal = "speed" | "endurance" | "technique";
export type Level = "beginner" | "competitive" | "elite";
export type Equipment = "Fins" | "Kickboard" | "Pull Buoy" | "Hand Paddles";

export interface WorkoutInputs {
  disciplines: Discipline[];
  distanceM: number;
  goals: Goal[];
  level: Level;
  equipment: Equipment[];
  pb100FreestyleSec?: number;
}

export interface SetRow {
  label: string;
  reps: number;
  distanceM: number;
  sendOff: string;
  gear?: string;
}

export interface StageBlock {
  key: "warmup" | "preset" | "main" | "cooldown";
  title: string;
  rows: SetRow[];
  totalM: number;
}

export interface GeneratedWorkout {
  stages: StageBlock[];
  totalM: number;
  seedLabel: string;
}

// mulberry32 — small, fast, deterministic PRNG so "today's" workout is
// stable all day and only rotates at midnight, mirroring the real site.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeed(d = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayIndex = Math.floor((d.getTime() - start) / 86400000);
  return d.getUTCFullYear() * 1000 + dayIndex;
}

function pickOne<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function roundToNearest(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}

// Given a target share of the workout and a "natural" rep distance, keep
// the rep count inside a realistic range by doubling the rep distance
// (25 -> 50 -> 100 -> 200...) rather than ever prescribing an absurd rep
// count like "28 x 50m" in one block.
function scaleToReasonableReps(shareM: number, baseDistM: number, maxReps = 16): { reps: number; distanceM: number } {
  let distanceM = baseDistM;
  let reps = Math.max(2, Math.round(shareM / distanceM));
  while (reps > maxReps) {
    distanceM *= 2;
    reps = Math.max(2, Math.round(shareM / distanceM));
  }
  return { reps, distanceM };
}

const PACE_BASE_SEC_PER_100: Record<Goal, number> = {
  speed: 88,
  endurance: 100,
  technique: 96,
};

function basePace100(goals: Goal[], pb100FreestyleSec?: number): number {
  if (pb100FreestyleSec && pb100FreestyleSec > 0) {
    // Blend the swimmer's own PB with the goal-average base pace.
    const goalAvg =
      goals.reduce((sum, g) => sum + PACE_BASE_SEC_PER_100[g], 0) / Math.max(1, goals.length);
    return Math.round(pb100FreestyleSec * 0.7 + goalAvg * 0.3);
  }
  const goalAvg =
    goals.reduce((sum, g) => sum + PACE_BASE_SEC_PER_100[g], 0) / Math.max(1, goals.length);
  return Math.round(goalAvg);
}

function formatSendOff(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `@ ${m}:${String(s).padStart(2, "0")}`;
}

const PRESET_ARCHETYPES = [
  { name: "Speed-Build Activation", desc: "Build-to-fast 25s, accelerate hard into the wall." },
  { name: "Heart-Rate Activation", desc: "Descending 50s to lift heart rate into the working zone." },
  { name: "Underwater Dolphin Activation", desc: "6-8 underwater dolphin kicks off every wall, tight streamline." },
  { name: "Turn & Breakout Activation", desc: "Fast approach, explosive turn, strong breakout." },
  { name: "Stroke-Rate Activation", desc: "25 easy / 25 fast tempo switch." },
];

const MAIN_SET_ARCHETYPES: Record<Goal, { name: string; repDistM: number }[]> = {
  speed: [
    { name: "Descending Power Ladder", repDistM: 50 },
    { name: "Explosive Turns & Starts", repDistM: 25 },
    { name: "Sprint Reps", repDistM: 50 },
  ],
  endurance: [
    { name: "Aerobic Base", repDistM: 200 },
    { name: "Negative-Split Pull", repDistM: 100 },
    { name: "Descend Ladder", repDistM: 50 },
  ],
  technique: [
    { name: "Drill Focus", repDistM: 50 },
    { name: "Stroke-Count Focus", repDistM: 100 },
    { name: "Tempo Awareness Set", repDistM: 50 },
  ],
};

const LEVEL_REST_ADD: Record<Level, number> = { beginner: 15, competitive: 8, elite: 0 };
const LEVEL_INTERVAL_MULT: Record<Level, number> = { beginner: 1.25, competitive: 1.05, elite: 0.9 };

export function nextStrokeRotator(disciplines: Discipline[]) {
  let i = 0;
  return () => {
    const s = disciplines[i % disciplines.length];
    i += 1;
    return s;
  };
}

export function generateWorkout(inputs: WorkoutInputs): GeneratedWorkout {
  const seed = dailySeed();
  const rng = mulberry32(seed);
  const disciplines: Discipline[] = inputs.disciplines.length ? inputs.disciplines : ["Freestyle"];
  const goals: Goal[] = inputs.goals.length ? inputs.goals : ["endurance"];
  const nextStroke = nextStrokeRotator(disciplines);

  const totalM = inputs.distanceM;
  const warmupM = roundToNearest(totalM * 0.1, 100);
  const presetM = roundToNearest(totalM * 0.15, 100);
  const mainM = roundToNearest(totalM * 0.55, 100);
  const cooldownM = Math.max(150, totalM - warmupM - presetM - mainM);

  const pace100 = basePace100(goals, inputs.pb100FreestyleSec);
  const intervalMult = LEVEL_INTERVAL_MULT[inputs.level];
  const restAdd = LEVEL_REST_ADD[inputs.level];

  const sendOffFor = (distM: number) => {
    const sec = (pace100 / 100) * distM * intervalMult + restAdd;
    return formatSendOff(sec);
  };

  // --- Warm-Up: always opens Freestyle, easy — matches the real site's rule.
  const warmupDrillReps = Math.max(4, Math.min(8, Math.round(warmupM / 100) + 2));
  const warmupRows: SetRow[] = [
    { label: "Freestyle, easy — long smooth strokes", reps: 1, distanceM: roundToNearest(warmupM * 0.4, 50), sendOff: sendOffFor(200) },
    { label: "Drill / Build — odd 25 drill, even 25 build", reps: warmupDrillReps, distanceM: 25, sendOff: sendOffFor(25) },
    {
      label: `Kick — underwater dolphin off every wall${inputs.equipment.includes("Kickboard") ? " (Kickboard)" : ""}`,
      reps: 4,
      distanceM: 50,
      sendOff: sendOffFor(50),
      gear: inputs.equipment.includes("Kickboard") ? "Kickboard" : undefined,
    },
  ];
  const warmupTotal = warmupRows.reduce((s, r) => s + r.reps * r.distanceM, 0);

  // --- Pre-Set: one activation archetype, day-rotated.
  const preset = pickOne(rng, PRESET_ARCHETYPES);
  const presetScaled = scaleToReasonableReps(presetM, 50, 12);
  const presetRows: SetRow[] = [
    {
      label: `${preset.name} — ${nextStroke()}`,
      reps: presetScaled.reps,
      distanceM: presetScaled.distanceM,
      sendOff: sendOffFor(presetScaled.distanceM),
    },
  ];
  const presetTotal = presetRows.reduce((s, r) => s + r.reps * r.distanceM, 0);

  // --- Main Set: 1-2 blocks drawn from the combined goal pool.
  const pool = goals.flatMap((g) => MAIN_SET_ARCHETYPES[g]);
  const blockCount = totalM >= 3500 && pool.length > 1 ? 2 : 1;
  const shareEach = mainM / blockCount;
  const mainRows: SetRow[] = [];
  const usedNames = new Set<string>();
  for (let b = 0; b < blockCount; b++) {
    let archetype = pickOne(rng, pool);
    let guard = 0;
    while (usedNames.has(archetype.name) && guard < 8) {
      archetype = pickOne(rng, pool);
      guard += 1;
    }
    usedNames.add(archetype.name);
    const stroke = nextStroke();
    const gear =
      inputs.equipment.length && rng() > 0.5 ? pickOne(rng, inputs.equipment) : undefined;
    // Freestyle/IM can scale rep distance freely; the three "off" strokes
    // cap out at 200m per rep (mirrors the real site's realism rule), so
    // extra volume for those strokes should grow the rep count instead.
    const capped = stroke === "Backstroke" || stroke === "Butterfly" || stroke === "Breaststroke";
    const maxDist = capped ? 200 : Infinity;
    let scaled = scaleToReasonableReps(shareEach, archetype.repDistM, 16);
    if (scaled.distanceM > maxDist) {
      scaled = { distanceM: maxDist, reps: Math.max(2, Math.round(shareEach / maxDist)) };
    }
    mainRows.push({
      label: `${archetype.name} — ${stroke}`,
      reps: scaled.reps,
      distanceM: scaled.distanceM,
      sendOff: sendOffFor(scaled.distanceM),
      gear,
    });
  }
  const mainTotal = mainRows.reduce((s, r) => s + r.reps * r.distanceM, 0);

  // --- Cool-Down: easy swim, whatever distance remains.
  const cooldownRows: SetRow[] = [
    { label: "Freestyle / Backstroke, easy — shake it out", reps: 1, distanceM: cooldownM, sendOff: sendOffFor(200) },
  ];
  const cooldownTotal = cooldownRows.reduce((s, r) => s + r.reps * r.distanceM, 0);

  return {
    stages: [
      { key: "warmup", title: "Warm-Up", rows: warmupRows, totalM: warmupTotal },
      { key: "preset", title: `Pre-Set — ${preset.name}`, rows: presetRows, totalM: presetTotal },
      { key: "main", title: "Main Set", rows: mainRows, totalM: mainTotal },
      { key: "cooldown", title: "Cool-Down", rows: cooldownRows, totalM: cooldownTotal },
    ],
    totalM: warmupTotal + presetTotal + mainTotal + cooldownTotal,
    seedLabel: new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
  };
}
