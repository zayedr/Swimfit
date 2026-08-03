import { ShoppingBag } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const NAV_LINKS: { label: string; to: string }[] = [
  { label: "WORKOUTS", to: "/workouts" },
  { label: "GYM", to: "/gym" },
  { label: "COACH", to: "/coach" },
  { label: "TRACKER", to: "/tracker" },
  { label: "PRICING", to: "/pricing" },
];

export default function Header() {
  const { pathname } = useLocation();

  return (
    <header
      className="relative z-20 flex items-center justify-between"
      style={{
        paddingInline: "var(--pad-x)",
        paddingTop: "var(--header-pt)",
        paddingBottom: "var(--section-gap)",
      }}
    >
      <Link
        to="/"
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
      </Link>

      <nav
        className="font-jakarta font-medium uppercase flex items-center"
        style={{ fontSize: "var(--nav)", gap: "var(--gap-nav)", letterSpacing: "0.2em" }}
      >
        {NAV_LINKS.map((link) => {
          const active = pathname === link.to;
          return (
            <Link
              key={link.label}
              to={link.to}
              aria-current={active ? "page" : undefined}
              className="relative pb-0.5 transition-opacity hover:opacity-60"
            >
              {link.label}
              <span
                className={`absolute left-0 -bottom-0.5 h-px bg-black transition-all ${
                  active ? "w-full" : "w-0"
                }`}
                aria-hidden="true"
              />
            </Link>
          );
        })}
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
