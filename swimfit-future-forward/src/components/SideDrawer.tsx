import { X, ChevronRight, Check } from "lucide-react";
import type { DrawerKind } from "../lib/constants";
import { WORKOUTS_CONTENT, GYM_CONTENT, TRACKER_CONTENT, PRICING_CONTENT } from "../lib/constants";

interface SideDrawerProps {
  kind: DrawerKind;
  onClose: () => void;
}

function WorkoutsPanel() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--section-gap)" }}>
      {WORKOUTS_CONTENT.items.map((item) => (
        <div
          key={item.title}
          className="flex items-center justify-between border-b border-gray-200 pb-4"
        >
          <div className="flex flex-col gap-1">
            <span
              className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
              style={{ fontSize: "var(--micro)" }}
            >
              {item.tag}
            </span>
            <span className="font-jakarta font-semibold" style={{ fontSize: "var(--body)" }}>
              {item.title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-jakarta font-medium" style={{ fontSize: "var(--body)" }}>
              {item.price}
            </span>
            <button
              type="button"
              className="flex items-center gap-1 border border-gray-400 rounded-md uppercase font-jakarta hover:bg-black hover:text-white hover:border-black transition-colors"
              style={{
                fontSize: "var(--micro)",
                letterSpacing: "0.14em",
                padding: "0.4rem 0.75rem",
              }}
            >
              START
              <ChevronRight strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GymPanel() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--section-gap)" }}>
      {GYM_CONTENT.items.map((item) => (
        <div key={item.title} className="border-b border-gray-200 pb-4">
          <span
            className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
            style={{ fontSize: "var(--micro)" }}
          >
            {item.series}
          </span>
          <p className="font-jakarta font-semibold mt-1" style={{ fontSize: "var(--body)" }}>
            {item.title}
          </p>
          <p className="font-jakarta text-gray-600 mt-1" style={{ fontSize: "var(--micro)" }}>
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrackerPanel() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--section-gap)" }}>
      {TRACKER_CONTENT.items.map((item) => (
        <div
          key={item.date + item.title}
          className="flex items-start justify-between border-b border-gray-200 pb-4 gap-3"
        >
          <div className="flex flex-col gap-1">
            <span
              className="font-jakarta text-gray-500 uppercase tracking-[0.2em]"
              style={{ fontSize: "var(--micro)" }}
            >
              {item.date}
            </span>
            <span className="font-jakarta font-semibold" style={{ fontSize: "var(--body)" }}>
              {item.title}
            </span>
          </div>
          <span
            className="flex items-center gap-1 font-jakarta font-medium uppercase whitespace-nowrap"
            style={{ fontSize: "var(--micro)" }}
          >
            <Check strokeWidth={1.5} className="w-3 h-3" />
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function PricingPanel() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--section-gap)" }}>
      {PRICING_CONTENT.items.map((item) => (
        <div key={item.tier} className="border-b border-gray-200 pb-4">
          <div className="flex items-center justify-between">
            <span
              className={`font-jakarta uppercase tracking-[0.2em] ${
                item.featured ? "text-black font-semibold" : "text-gray-500"
              }`}
              style={{ fontSize: "var(--micro)" }}
            >
              {item.tier}
              {item.featured ? " · MOST POPULAR" : ""}
            </span>
            <span className="font-jakarta font-semibold" style={{ fontSize: "var(--body)" }}>
              {item.price}
              <span className="font-normal text-gray-500"> /{item.period.replace("per ", "")}</span>
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {item.features.map((f) => (
              <li
                key={f}
                className="font-jakarta text-gray-600"
                style={{ fontSize: "var(--micro)" }}
              >
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 flex items-center gap-1 border border-gray-400 rounded-md uppercase font-jakarta hover:bg-black hover:text-white hover:border-black transition-colors"
            style={{
              fontSize: "var(--micro)",
              letterSpacing: "0.14em",
              padding: "0.4rem 0.75rem",
            }}
          >
            GET STARTED
            <ChevronRight strokeWidth={1.5} className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

const DRAWER_META: Record<Exclude<DrawerKind, null>, { title: string; subtitle: string }> = {
  workouts: { title: WORKOUTS_CONTENT.title, subtitle: WORKOUTS_CONTENT.subtitle },
  gym: { title: GYM_CONTENT.title, subtitle: GYM_CONTENT.subtitle },
  tracker: { title: TRACKER_CONTENT.title, subtitle: TRACKER_CONTENT.subtitle },
  pricing: { title: PRICING_CONTENT.title, subtitle: PRICING_CONTENT.subtitle },
};

export default function SideDrawer({ kind, onClose }: SideDrawerProps) {
  const isOpen = kind !== null;
  const meta = kind ? DRAWER_META[kind] : null;

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity duration-300 ${
        isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!isOpen}
    >
      {/* Dimmed backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer panel */}
      <aside
        className={`absolute right-0 top-0 h-full bg-white w-full flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          maxWidth: "var(--drawer-max)",
          padding: "var(--drawer-pad)",
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2
              className="font-orbitron font-bold uppercase"
              style={{ fontSize: "var(--logo)" }}
            >
              {meta?.title}
            </h2>
            <p
              className="font-jakarta text-gray-500 uppercase tracking-[0.15em] mt-1"
              style={{ fontSize: "var(--micro)" }}
            >
              {meta?.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hover:opacity-60 transition-opacity"
          >
            <X strokeWidth={1.5} style={{ width: "var(--icon)", height: "var(--icon)" }} />
          </button>
        </div>

        <div className="overflow-y-auto mt-6 flex-1">
          {kind === "workouts" && <WorkoutsPanel />}
          {kind === "gym" && <GymPanel />}
          {kind === "tracker" && <TrackerPanel />}
          {kind === "pricing" && <PricingPanel />}
        </div>
      </aside>
    </div>
  );
}
