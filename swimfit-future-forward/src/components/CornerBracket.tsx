type Corner = "tl" | "tr" | "bl" | "br";

interface CornerBracketProps {
  corner: Corner;
  className?: string;
}

// A single L-shaped corner bracket, stroke 1.5, drawn so the same 24x24
// viewBox path can be rotated per-corner via a CSS transform rather than
// needing four separate hand-authored paths.
const ROTATION: Record<Corner, string> = {
  tl: "rotate(0deg)",
  tr: "rotate(90deg)",
  br: "rotate(180deg)",
  bl: "rotate(270deg)",
};

export default function CornerBracket({ corner, className = "" }: CornerBracketProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ width: "var(--corner)", height: "var(--corner)", transform: ROTATION[corner] }}
      aria-hidden="true"
    >
      <path
        d="M2 2H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2 2V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
