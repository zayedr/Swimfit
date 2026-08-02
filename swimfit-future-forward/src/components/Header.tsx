import { useState } from "react";
import { ShoppingBag, Menu } from "lucide-react";
import type { DrawerKind } from "../lib/constants";
import MobileMenu from "./MobileMenu";

interface HeaderProps {
  onOpenDrawer: (kind: DrawerKind) => void;
}

const NAV_LINKS: { label: string; kind: DrawerKind }[] = [
  { label: "WORKOUTS", kind: "workouts" },
  { label: "DRYLAND", kind: "dryland" },
  { label: "TRACKER", kind: "tracker" },
];

export default function Header({ onOpenDrawer }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="relative z-20 flex items-center justify-between px-6 py-5 md:px-10 md:py-6">
        <span className="font-oswald font-bold tracking-widest text-xl uppercase">
          SWIMFIT
        </span>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm tracking-wide uppercase">
          {NAV_LINKS.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={() => onOpenDrawer(link.kind)}
              className="hover:opacity-70 transition-opacity"
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            aria-label="Shopping bag"
            className="hover:opacity-70 transition-opacity"
          >
            <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="md:hidden hover:opacity-70 transition-opacity"
        >
          <Menu className="w-6 h-6" strokeWidth={1.5} />
        </button>
      </header>

      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onSelect={onOpenDrawer}
      />
    </>
  );
}
