interface PageIntroProps {
  eyebrow: string;
  heading: string;
}

// Shared inner-page heading block — small-caps eyebrow over an Orbitron
// uppercase heading, matching the Hero's own headline typography scale
// (just a step down) so every inner page reads as part of the same system.
export default function PageIntro({ eyebrow, heading }: PageIntroProps) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-jakarta text-gray-500 uppercase tracking-[0.25em]"
        style={{ fontSize: "var(--micro)" }}
      >
        {eyebrow}
      </span>
      <h1
        className="font-orbitron font-extrabold uppercase"
        style={{
          fontSize: "clamp(1.75rem, 2.4vw + 1rem, 3rem)",
          letterSpacing: "0.04em",
          lineHeight: "1.05",
        }}
      >
        {heading}
      </h1>
    </div>
  );
}
