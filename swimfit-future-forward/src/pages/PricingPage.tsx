import { Check } from "lucide-react";
import PageShell from "../components/PageShell";
import PageIntro from "../components/PageIntro";
import Panel from "../components/Panel";
import { PRICING_CONTENT } from "../lib/constants";

export default function PricingPage() {
  return (
    <PageShell>
      <PageIntro eyebrow={PRICING_CONTENT.subtitle} heading={PRICING_CONTENT.title} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PRICING_CONTENT.items.map((item) => (
          <Panel
            key={item.tier}
            style={{ padding: "var(--feature-pad)" }}
            className={`flex flex-col gap-4 ${item.featured ? "bg-black text-white" : ""}`}
          >
            <span
              className={`font-jakarta uppercase tracking-[0.2em] ${item.featured ? "text-white" : "text-gray-500"}`}
              style={{ fontSize: "var(--micro)" }}
            >
              {item.tier}
              {item.featured ? " · Most Popular" : ""}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-orbitron font-black" style={{ fontSize: "clamp(2rem, 2.5vw + 1rem, 3rem)" }}>
                {item.price}
              </span>
              <span className={`font-jakarta ${item.featured ? "text-gray-300" : "text-gray-500"}`} style={{ fontSize: "var(--body)" }}>
                /{item.period.replace("per ", "")}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {item.features.map((f) => (
                <li key={f} className="flex items-center gap-2 font-jakarta" style={{ fontSize: "var(--body)" }}>
                  <Check strokeWidth={1.5} className="w-4 h-4 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`mt-auto font-orbitron font-bold uppercase rounded-md transition-colors ${
                item.featured
                  ? "bg-white text-black hover:bg-gray-200"
                  : "bg-black text-white hover:bg-gray-800"
              }`}
              style={{ fontSize: "var(--body)", letterSpacing: "0.1em", paddingBlock: "var(--btn-py)" }}
            >
              Get Started
            </button>
          </Panel>
        ))}
      </div>
    </PageShell>
  );
}
