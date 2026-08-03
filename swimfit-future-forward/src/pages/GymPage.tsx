import { useState } from "react";
import PageShell from "../components/PageShell";
import PageIntro from "../components/PageIntro";
import Panel from "../components/Panel";
import Chip from "../components/Chip";
import { GYM_CONTENT, GYM_FOCUS_EXERCISES } from "../lib/constants";

export default function GymPage() {
  const [focus, setFocus] = useState(GYM_CONTENT.items[0].title);
  const exercises = GYM_FOCUS_EXERCISES[focus] ?? [];
  const activeItem = GYM_CONTENT.items.find((i) => i.title === focus);

  return (
    <PageShell>
      <PageIntro eyebrow={GYM_CONTENT.subtitle} heading={GYM_CONTENT.title} />

      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap gap-2">
          {GYM_CONTENT.items.map((item) => (
            <Chip key={item.title} label={item.title} active={focus === item.title} onClick={() => setFocus(item.title)} />
          ))}
        </div>

        {activeItem && (
          <p className="font-jakarta text-gray-600" style={{ fontSize: "var(--body)", maxWidth: "42rem" }}>
            {activeItem.description}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exercises.map((ex) => (
            <Panel key={ex.name} style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-2">
              <span className="font-orbitron font-bold uppercase" style={{ fontSize: "var(--body)", letterSpacing: "0.04em" }}>
                {ex.name}
              </span>
              <span className="font-jakarta text-gray-500 uppercase tracking-[0.12em]" style={{ fontSize: "var(--micro)" }}>
                {ex.prescription}
              </span>
            </Panel>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
