import { X } from "lucide-react";
import type { DrawerKind } from "../lib/constants";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (kind: DrawerKind) => void;
}

const LINKS: { label: string; kind: DrawerKind }[] = [
  { label: "WORKOUTS", kind: "workouts" },
  { label: "DRYLAND", kind: "dryland" },
  { label: "TRACKER", kind: "tracker" },
];

export default function MobileMenu({ open, onClose, onSelect }: MobileMenuProps) {
  return (
    <div
      className={`fixed inset-0 z-50 bg-black text-white flex flex-col transition-opacity duration-300 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between px-6 pt-6">
        <span className="font-oswald font-bold tracking-widest text-xl uppercase">
          SWIMFIT
        </span>
        <button type="button" onClick={onClose} aria-label="Close menu" className="hover:opacity-70 transition-opacity">
          <X className="w-6 h-6" strokeWidth={1.5} />
        </button>
      </div>

      <nav className="flex flex-col items-start justify-center flex-1 gap-6 px-6">
        {LINKS.map((link, i) => (
          <button
            key={link.label}
            type="button"
            onClick={() => {
              onSelect(link.kind);
              onClose();
            }}
            className={`font-oswald font-bold uppercase text-4xl tracking-wide transition-all duration-500 ${
              open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: open ? `${i * 90}ms` : "0ms" }}
          >
            {link.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
