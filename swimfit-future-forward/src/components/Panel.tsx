import type { ReactNode } from "react";
import CornerBracket from "./CornerBracket";

interface PanelProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// The bordered, corner-bracketed card used by the Hero's feature panel,
// reused site-wide as the one "container" primitive for inner pages so
// every page shares the exact same card language.
export default function Panel({ children, className = "", style }: PanelProps) {
  return (
    <div
      className={`relative border border-gray-300 rounded-md ${className}`}
      style={style}
    >
      <CornerBracket corner="tl" className="absolute -top-px -left-px text-black" />
      <CornerBracket corner="tr" className="absolute -top-px -right-px text-black" />
      <CornerBracket corner="bl" className="absolute -bottom-px -left-px text-black" />
      <CornerBracket corner="br" className="absolute -bottom-px -right-px text-black" />
      {children}
    </div>
  );
}
