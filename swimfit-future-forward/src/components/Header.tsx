import { ShoppingBag } from "lucide-react";
import type { DrawerKind } from "../lib/constants";

interface HeaderProps {
  onOpenDrawer: (kind: DrawerKind) => void;
}

const NAV_LINKS: { label: string; kind: DrawerKind }[] = [
  { label: "WORKOUTS", kind: "workouts" },
  { label: "GYM", kind: "gym" },
  { label: "TRACKER", kind: "tracker" },
  { label: "PRICING", kind: "pricing" },
];

export default function Header({ onOpenDrawer }: HeaderProps) {
  return (
    <header
      className="relative z-20 flex items-center justify-between"
      style={{
        paddingInline: "var(--pad-x)",
        paddingTop: "var(--header-pt)",
        paddingBottom: "var(--section-gap)",
      }}
    >
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="font-orbitron font-black tracking-[0.15em] hover:opacity-80 transition-opacity"
        style={{ fontSize: "var(--logo)" }}
      >
        SWIMFIT
        <span
          className="-mt-0.5 ml-0.5 align-top inline-block"
          style={{ fontSize: "var(--logo-deg)" }}
        >
          ˚
        </span>
      </button>

      <nav
        className="font-jakarta font-medium uppercase flex items-center"
        style={{ fontSize: "var(--nav)", gap: "var(--gap-nav)", letterSpacing: "0.2em" }}
      >
        {NAV_LINKS.map((link) => (
          <button
            key={link.label}
            type="button"
            onClick={() => onOpenDrawer(link.kind)}
            className="hover:opacity-60 transition-opacity"
          >
            {link.label}
          </button>
        ))}
        <span className="text-gray-300" aria-hidden="true">
          |
        </span>
        <button
          type="button"
          aria-label="Shopping bag"
          className="hover:opacity-60 transition-opacity"
        >
          <ShoppingBag strokeWidth={1.5} style={{ width: "var(--icon)", height: "var(--icon)" }} />
        </button>
      </nav>
    </header>
  );
}
