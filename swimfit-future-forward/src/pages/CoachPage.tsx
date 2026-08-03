import { useState } from "react";
import { Send } from "lucide-react";
import PageShell from "../components/PageShell";
import PageIntro from "../components/PageIntro";
import Panel from "../components/Panel";
import Chip from "../components/Chip";

interface Message {
  role: "user" | "coach";
  text: string;
}

const PROMPT_CHIPS = ["Explain lactate threshold", "Build a taper plan", "Fix my catch", "Nutrition for race day"];

// Lightweight, clearly-scoped demo reply generator — this page previews the
// AI Coach's chat surface/UI only. It is not wired to the real aiSwimCoach
// Cloud Function (that's a separate backend-integration task), so replies
// are honest canned coaching notes, never presented as a live model response.
const REPLIES: Record<string, string> = {
  "explain lactate threshold":
    "Lactate threshold is the effort level where lactate starts building up faster than your body can clear it — roughly your 'comfortably hard, sustainable for ~20-30 min' pace. Training just below and at that pace (broken 200-400m repeats on a tight interval) is what raises it over time.",
  "build a taper plan":
    "A simple 2-week taper: Week 1 cut total volume ~25%, keep 1-2 short race-pace efforts to stay sharp. Week 2 cut another 30-40%, mostly easy swimming plus a few short fast bursts 2-3 days out. Sleep and nutrition matter more than any extra yardage right now.",
  "fix my catch":
    "Focus on an early vertical forearm — think about pointing your fingertips down and pulling your body past your hand, not pulling your hand past your body. A single-arm drill with a slight pause at full extension is the fastest way to feel it.",
  "nutrition for race day":
    "Eat a familiar, carb-forward meal 3+ hours before racing — nothing new. A small carb snack (banana, gel) 30-60 minutes out tops off glycogen without sitting heavy. Hydrate steadily through the morning rather than all at once.",
};

function replyFor(text: string): string {
  const key = text.trim().toLowerCase();
  if (REPLIES[key]) return REPLIES[key];
  return "Good question — in the full app this connects to a real swim-specific AI coach. This preview page is showing the chat UI only; try one of the suggested prompts above for a sample reply.";
}

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  function send(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", text };
    const coachMsg: Message = { role: "coach", text: replyFor(text) };
    setMessages((prev) => [...prev, userMsg, coachMsg]);
    setInput("");
  }

  return (
    <PageShell>
      <PageIntro eyebrow="AI Swim Coach" heading="Ask The Coach" />

      <Panel style={{ padding: "var(--feature-pad)" }} className="flex flex-col gap-4 flex-1 min-h-[28rem]">
        <div className="flex flex-wrap gap-2">
          {PROMPT_CHIPS.map((p) => (
            <Chip key={p} label={p} active={false} onClick={() => send(p)} />
          ))}
        </div>

        <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="font-jakarta text-gray-500" style={{ fontSize: "var(--body)" }}>
              Ask a swim-training question, or tap a suggested prompt above.
            </p>
          )}
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`max-w-[80%] rounded-md px-4 py-2.5 font-jakarta ${
                m.role === "user" ? "self-end bg-black text-white" : "self-start bg-gray-100 text-black"
              }`}
              style={{ fontSize: "var(--body)" }}
            >
              {m.text}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-gray-200 pt-4"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about technique, pacing, nutrition..."
            className="flex-1 border border-gray-400 rounded-md font-jakarta focus:outline-none focus:border-black"
            style={{ fontSize: "var(--body)", padding: "0.6rem 0.9rem" }}
          />
          <button
            type="submit"
            aria-label="Send"
            className="bg-black text-white rounded-md hover:bg-gray-800 transition-colors flex items-center justify-center"
            style={{ width: "2.75rem", height: "2.75rem" }}
          >
            <Send strokeWidth={1.5} className="w-4 h-4" />
          </button>
        </form>
      </Panel>
    </PageShell>
  );
}
