interface CheckerboardProps {
  className?: string;
}

// A small 4x2 black/white checkerboard grid, sized to sit inline beside the
// "LIMITS" headline word. Alternating filled/unfilled squares only — no color.
const COLS = 4;
const ROWS = 2;
const CELL = 10;

export default function Checkerboard({ className = "" }: CheckerboardProps) {
  const squares = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const filled = (row + col) % 2 === 0;
      squares.push(
        <rect
          key={`${row}-${col}`}
          x={col * CELL}
          y={row * CELL}
          width={CELL}
          height={CELL}
          fill={filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1"
        />,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
      className={`inline-block align-middle ${className}`}
      style={{ width: "var(--checker-w)", height: "var(--checker-h)" }}
      aria-hidden="true"
    >
      {squares}
    </svg>
  );
}
