import { X, ChevronRight, Check } from "lucide-react";
import type { DrawerKind } from "../lib/constants";
import { WORKOUTS_CONTENT, DRYLAND_CONTENT, TRACKER_CONTENT } from "../lib/constants";

interface SideDrawerProps {
  kind: DrawerKind;
  onClose: () => void;
}

function WorkoutsPanel() {
  return (
    <div className="flex flex-col gap-5">
      {WORKOUTS_CONTENT.items.map((item) => (
        <div
          key={item.title}
          className="flex items-center justify-between border-b border-gray-200 pb-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] text-gray-500 uppercase tracking-widest">
              {item.tag}
            </span>
            <span className="text-sm font-semibold">{item.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{item.price}</span>
            <button
              type="button"
              className="flex items-center gap-1 border border-gray-400 rounded-md uppercase text-[0.65rem] tracking-wide px-3 py-1.5 hover:bg-black hover:text-white hover:border-black transition-colors"
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

function DrylandPanel() {
  return (
    <div className="flex flex-col gap-5">
      {DRYLAND_CONTENT.items.map((item) => (
        <div key={item.series} className="border-b border-gray-200 pb-4">
          <span className="text-[0.65rem] text-gray-500 uppercase tracking-widest">
            {item.series}
          </span>
          <p className="text-sm font-semibold mt-1">{item.title}</p>
          <p className="text-[0.65rem] text-gray-600 mt-1">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function TrackerPanel() {
  return (
    <div className="flex flex-col gap-5">
      {TRACKER_CONTENT.items.map((item) => (
        <div
          key={item.date + item.title}
          className="flex items-start justify-between gap-3 border-b border-gray-200 pb-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] text-gray-500 uppercase tracking-widest">
              {item.date}
            </span>
            <span className="text-sm font-semibold">{item.title}</span>
          </div>
          <span className="flex items-center gap-1 text-[0.65rem] font-medium uppercase whitespace-nowrap">
            <Check strokeWidth={1.5} className="w-3 h-3" />
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
}

const DRAWER_META: Record<Exclude<DrawerKind, null>, { title: string; subtitle: string }> = {
  workouts: { title: WORKOUTS_CONTENT.title, subtitle: WORKOUTS_CONTENT.subtitle },
  dryland: { title: DRYLAND_CONTENT.title, subtitle: DRYLAND_CONTENT.subtitle },
  tracker: { title: TRACKER_CONTENT.title, subtitle: TRACKER_CONTENT.subtitle },
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
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-white flex flex-col p-8 transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="font-oswald font-bold uppercase text-xl">{meta?.title}</h2>
            <p className="text-[0.65rem] text-gray-500 uppercase tracking-wide mt-1">
              {meta?.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hover:opacity-60 transition-opacity"
          >
            <X strokeWidth={1.5} className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto mt-6 flex-1">
          {kind === "workouts" && <WorkoutsPanel />}
          {kind === "dryland" && <DrylandPanel />}
          {kind === "tracker" && <TrackerPanel />}
        </div>
      </aside>
    </div>
  );
}
