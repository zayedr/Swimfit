interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

// The toggle-pill button used across the drawer panels — border-gray-400,
// rounded-md, inverts to solid black when active/pressed. Reused as the
// one "selectable option" primitive across every inner page's pickers.
export default function Chip({ label, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`font-jakarta uppercase rounded-md border transition-colors ${
        active
          ? "bg-black text-white border-black"
          : "bg-white text-black border-gray-400 hover:border-black"
      }`}
      style={{
        fontSize: "var(--micro)",
        letterSpacing: "0.14em",
        padding: "0.45rem 0.85rem",
      }}
    >
      {label}
    </button>
  );
}
