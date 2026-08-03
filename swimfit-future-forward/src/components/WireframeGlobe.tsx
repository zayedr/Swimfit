interface WireframeGlobeProps {
  className?: string;
}

// A wireframe sphere — outer circle, three horizontal "latitude" ellipses,
// and three vertical "longitude" ellipses — stroke only, no fill, matching
// the monochrome line-art language used across every other custom SVG here.
export default function WireframeGlobe({ className = "" }: WireframeGlobeProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      style={{ width: "var(--globe)", height: "var(--globe)" }}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1" />
      {/* latitude lines */}
      <ellipse cx="24" cy="24" rx="20" ry="7" stroke="currentColor" strokeWidth="0.75" />
      <ellipse cx="24" cy="24" rx="20" ry="14" stroke="currentColor" strokeWidth="0.75" />
      <line x1="4" y1="24" x2="44" y2="24" stroke="currentColor" strokeWidth="0.75" />
      {/* longitude lines */}
      <ellipse cx="24" cy="24" rx="7" ry="20" stroke="currentColor" strokeWidth="0.75" />
      <ellipse cx="24" cy="24" rx="14" ry="20" stroke="currentColor" strokeWidth="0.75" />
      <line x1="24" y1="4" x2="24" y2="44" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}
