import { useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import PageIntro from "../components/PageIntro";
import Panel from "../components/Panel";
import Chip from "../components/Chip";
import CornerBracket from "../components/CornerBracket";
import {
  generateWorkout,
  type Discipline,
  type Equipment,
  type Goal,
  type GeneratedWorkout,
  type Level,
} from "../lib/workoutGenerator";

const DISCIPLINES: Discipline[] = ["Freestyle", "Backstroke", "Butterfly", "Breaststroke", "Individual Medley"];
const EQUIPMENT: Equipment[] = ["Fins", "Kickboard", "Pull Buoy", "Hand Paddles"];
const GOALS: { key: Goal; label: string }[] = [
  { key: "endurance", label: "Aerobic / Distance" },
  { key: "speed", label: "Sprint / Power" },
  { key: "technique", label: "Technique / Drills" },
];
const LEVELS: { key: Level; label: string }[] = [
  { key: "beginner", label: "Beginner" },
  { key: "competitive", label: "Competitive" },
  { key: "elite", label: "Elite" },
];

const STAGE_LABEL: Record<GeneratedWorkout["stages"][number]["key"], string> = {
  warmup: "Warm-Up",
  preset: "Pre-Set",
  main: "Main Set",
  cooldown: "Cool-Down",
};

function toggleInArray<T>(arr: T[], value: T, keepAtLeastOne = true): T[] {
  const has = arr.includes(value);
  if (has) {
    if (keepAtLeastOne && arr.length === 1) return arr;
    return arr.filter((v) => v !== value);
  }
  return [...arr, value];
}

export default function WorkoutsPage() {
  const [disciplines, setDisciplines] = useState<Discipline[]>(["Freestyle"]);
  const [distanceM, setDistanceM] = useState(2500);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [goals, setGoals] = useState<Goal[]>(["endurance"]);
  const [level, setLevel] = useState<Level>("competitive");
  const [pb100, setPb100] = useState("");
  const [result, setResult] = useState<GeneratedWorkout | null>(null);

  const pbSeconds = useMemo(() => {
    const match = /^(\d+):(\d{2})$/.exec(pb100.trim());
    if (!match) return undefined;
    return Number(match[1]) * 60 + Number(match[2]);
  }, [pb100]);

  function handleGenerate() {
    setResult(
      generateWorkout({
        disciplines,
        distanceM,
        goals,
        level,
        equipment,
        pb100FreestyleSec: pbSeconds,
      }),
    );
  }

  return (
    <PageShell>
      <PageIntro eyebrow="Swim Workout Generator" heading="Build Your Own" />

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 flex-1">
        {/* Left: configuration */}
        <div className="flex flex-col gap-6 lg:w-[42%]">
          <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-4">
            <span
              className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
              style={{ fontSize: "var(--micro)" }}
            >
              Swimmer Profile
            </span>
            <label className="flex flex-col gap-1.5">
              <span className="font-jakarta uppercase tracking-[0.14em] text-gray-600" style={{ fontSize: "var(--micro)" }}>
                100m Freestyle PB (mm:ss, optional)
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="1:05"
                value={pb100}
                onChange={(e) => setPb100(e.target.value)}
                className="border border-gray-400 rounded-md font-jakarta focus:outline-none focus:border-black"
                style={{ fontSize: "var(--body)", padding: "0.5rem 0.75rem" }}
              />
            </label>
          </Panel>

          <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-4">
            <span
              className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
              style={{ fontSize: "var(--micro)" }}
            >
              Discipline
            </span>
            <div className="flex flex-wrap gap-2">
              {DISCIPLINES.map((d) => (
                <Chip
                  key={d}
                  label={d}
                  active={disciplines.includes(d)}
                  onClick={() => setDisciplines((prev) => toggleInArray(prev, d))}
                />
              ))}
            </div>
          </Panel>

          <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span
                className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
                style={{ fontSize: "var(--micro)" }}
              >
                Target Distance
              </span>
              <span className="font-jakarta font-semibold" style={{ fontSize: "var(--body)" }}>
                {distanceM.toLocaleString()}m
              </span>
            </div>
            <input
              type="range"
              min={1000}
              max={6000}
              step={100}
              value={distanceM}
              onChange={(e) => setDistanceM(Number(e.target.value))}
              className="w-full accent-black"
            />
          </Panel>

          <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-4">
            <span
              className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
              style={{ fontSize: "var(--micro)" }}
            >
              Equipment
            </span>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((eq) => (
                <Chip
                  key={eq}
                  label={eq}
                  active={equipment.includes(eq)}
                  onClick={() => setEquipment((prev) => toggleInArray(prev, eq, false))}
                />
              ))}
            </div>
          </Panel>

          <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-4">
            <span
              className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
              style={{ fontSize: "var(--micro)" }}
            >
              Fitness Goals
            </span>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <Chip
                  key={g.key}
                  label={g.label}
                  active={goals.includes(g.key)}
                  onClick={() => setGoals((prev) => toggleInArray(prev, g.key))}
                />
              ))}
            </div>

            <span
              className="font-jakarta text-gray-500 uppercase tracking-[0.2em] mt-2"
              style={{ fontSize: "var(--micro)" }}
            >
              Level
            </span>
            <div className="flex gap-2">
              {LEVELS.map((l) => (
                <Chip key={l.key} label={l.label} active={level === l.key} onClick={() => setLevel(l.key)} />
              ))}
            </div>
          </Panel>

          <button
            type="button"
            onClick={handleGenerate}
            className="font-orbitron font-bold uppercase bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
            style={{
              fontSize: "var(--body)",
              letterSpacing: "0.14em",
              paddingBlock: "var(--btn-py)",
            }}
          >
            Generate Workout
          </button>
        </div>

        {/* Right: generated result */}
        <div className="flex-1">
          {!result && (
            <Panel
              style={{ padding: "var(--feature-pad)" }}
              className="flex flex-col items-center justify-center text-center gap-4 h-full min-h-[24rem]"
            >
              <CornerBracket corner="tl" className="text-black" />
              <p
                className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
                style={{ fontSize: "var(--body)" }}
              >
                Configure your profile, then generate today&rsquo;s set.
              </p>
            </Panel>
          )}

          {result && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span
                  className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
                  style={{ fontSize: "var(--micro)" }}
                >
                  {result.seedLabel} &middot; Total {(result.totalM / 1000).toFixed(2)}km
                </span>
              </div>

              {result.stages.map((stage) => (
                <Panel key={stage.key} style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2
                      className="font-orbitron font-bold uppercase"
                      style={{ fontSize: "var(--body)", letterSpacing: "0.08em" }}
                    >
                      {STAGE_LABEL[stage.key]}
                    </h2>
                    <span
                      className="font-jakarta text-gray-500 uppercase tracking-[0.1em]"
                      style={{ fontSize: "var(--micro)" }}
                    >
                      {stage.totalM}m
                    </span>
                  </div>
                  {stage.key === "preset" && (
                    <p className="font-jakarta text-gray-500" style={{ fontSize: "var(--micro)" }}>
                      {stage.title.replace("Pre-Set — ", "")}
                    </p>
                  )}
                  <div className="flex flex-col divide-y divide-gray-200">
                    {stage.rows.map((row, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-jakarta font-semibold" style={{ fontSize: "var(--micro)" }}>
                            <span className="font-orbitron">
                              {row.reps}&times;{row.distanceM}m
                            </span>{" "}
                            {row.label}
                          </span>
                          {row.gear && (
                            <span
                              className="font-jakarta text-gray-500 uppercase tracking-[0.12em]"
                              style={{ fontSize: "0.6rem" }}
                            >
                              {row.gear}
                            </span>
                          )}
                        </div>
                        <span
                          className="font-jakarta font-medium whitespace-nowrap"
                          style={{ fontSize: "var(--micro)" }}
                        >
                          {row.sendOff}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
