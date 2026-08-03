import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import PageIntro from "../components/PageIntro";
import Panel from "../components/Panel";
import { TRACKER_CONTENT } from "../lib/constants";

interface SwimEntry {
  id: string;
  date: string;
  distanceM: number;
  discipline: string;
}

const STORAGE_KEY = "swimfit_ff_tracker_entries";

function loadEntries(): SwimEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SwimEntry[];
  } catch {
    return [];
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TrackerPage() {
  const [entries, setEntries] = useState<SwimEntry[]>([]);
  const [date, setDate] = useState(todayISO());
  const [distance, setDistance] = useState("");
  const [discipline, setDiscipline] = useState("Freestyle");

  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  function persist(next: SwimEntry[]) {
    setEntries(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const distanceM = Number(distance);
    if (!distanceM || distanceM <= 0) return;
    const entry: SwimEntry = { id: crypto.randomUUID(), date, distanceM, discipline };
    persist([entry, ...entries]);
    setDistance("");
  }

  function handleDelete(id: string) {
    persist(entries.filter((e) => e.id !== id));
  }

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const weeklyTotal = entries
    .filter((e) => new Date(e.date) >= startOfWeek)
    .reduce((s, e) => s + e.distanceM, 0);
  const monthlyTotal = entries
    .filter((e) => new Date(e.date) >= startOfMonth)
    .reduce((s, e) => s + e.distanceM, 0);
  const allTimeTotal = entries.reduce((s, e) => s + e.distanceM, 0);

  return (
    <PageShell>
      <PageIntro eyebrow={TRACKER_CONTENT.subtitle} heading={TRACKER_CONTENT.title} />

      <div className="flex flex-col lg:flex-row gap-8">
        <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-4 lg:w-[38%]">
          <span className="font-jakarta text-gray-500 uppercase tracking-[0.2em]" style={{ fontSize: "var(--micro)" }}>
            Log A Swim
          </span>
          <form onSubmit={handleLog} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-jakarta uppercase tracking-[0.14em] text-gray-600" style={{ fontSize: "var(--micro)" }}>
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-gray-400 rounded-md font-jakarta focus:outline-none focus:border-black"
                style={{ fontSize: "var(--body)", padding: "0.5rem 0.75rem" }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-jakarta uppercase tracking-[0.14em] text-gray-600" style={{ fontSize: "var(--micro)" }}>
                Distance (m)
              </span>
              <input
                type="number"
                min={50}
                step={50}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="2000"
                className="border border-gray-400 rounded-md font-jakarta focus:outline-none focus:border-black"
                style={{ fontSize: "var(--body)", padding: "0.5rem 0.75rem" }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-jakarta uppercase tracking-[0.14em] text-gray-600" style={{ fontSize: "var(--micro)" }}>
                Discipline
              </span>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="border border-gray-400 rounded-md font-jakarta focus:outline-none focus:border-black"
                style={{ fontSize: "var(--body)", padding: "0.5rem 0.75rem" }}
              >
                {["Freestyle", "Backstroke", "Butterfly", "Breaststroke", "Individual Medley"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="font-orbitron font-bold uppercase bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
              style={{ fontSize: "var(--body)", letterSpacing: "0.14em", paddingBlock: "var(--btn-py)" }}
            >
              Log Swim
            </button>
          </form>
        </Panel>

        <div className="flex-1 flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "This Week", value: weeklyTotal },
              { label: "This Month", value: monthlyTotal },
              { label: "All Time", value: allTimeTotal },
            ].map((s) => (
              <Panel key={s.label} style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-1">
                <span className="font-jakarta text-gray-500 uppercase tracking-[0.15em]" style={{ fontSize: "var(--micro)" }}>
                  {s.label}
                </span>
                <span className="font-orbitron font-black" style={{ fontSize: "clamp(1.25rem, 1.5vw + 0.75rem, 2rem)" }}>
                  {(s.value / 1000).toFixed(2)}
                  <span className="text-gray-500" style={{ fontSize: "var(--body)" }}>
                    {" "}
                    km
                  </span>
                </span>
              </Panel>
            ))}
          </div>

          <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-3">
            <span className="font-jakarta text-gray-500 uppercase tracking-[0.2em]" style={{ fontSize: "var(--micro)" }}>
              Recent Entries
            </span>
            {entries.length === 0 && (
              <p className="font-jakarta text-gray-500" style={{ fontSize: "var(--body)" }}>
                No swims logged yet — log your first one to see it here.
              </p>
            )}
            <div className="flex flex-col divide-y divide-gray-200">
              {entries.slice(0, 12).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-jakarta font-semibold" style={{ fontSize: "var(--body)" }}>
                      {e.distanceM.toLocaleString()}m &middot; {e.discipline}
                    </span>
                    <span className="font-jakarta text-gray-500" style={{ fontSize: "var(--micro)" }}>
                      {e.date}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    className="font-jakarta text-gray-400 hover:text-black transition-colors uppercase tracking-[0.1em]"
                    style={{ fontSize: "var(--micro)" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
