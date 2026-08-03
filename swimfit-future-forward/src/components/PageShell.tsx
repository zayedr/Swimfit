import type { ReactNode } from "react";
import Header from "./Header";

interface PageShellProps {
  children: ReactNode;
}

// Shared wrapper for every inner page (Workouts, Gym, Tracker, Pricing...):
// the same faint blueprint grid the Hero's interactive background uses
// (static here — no mouse-tracked spotlight, since these pages scroll and
// carry real content rather than a single hero viewport), the same Header,
// and consistent page padding so every page reads as part of one app.
export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-white text-black font-jakarta relative overflow-x-hidden">
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(100,116,139,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <main
          className="flex-1 flex flex-col"
          style={{ paddingInline: "var(--pad-x)", paddingBottom: "var(--main-py)", gap: "var(--main-py)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
