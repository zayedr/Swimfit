import { ArrowUpRight } from "lucide-react";
import CornerBracket from "./CornerBracket";
import Checkerboard from "./Checkerboard";
import WireframeGlobe from "./WireframeGlobe";

export default function Hero() {
  return (
    <main
      className="relative z-10 flex flex-col lg:flex-row lg:justify-between flex-1 gap-10"
      style={{
        paddingInline: "var(--pad-x)",
        paddingBlock: "var(--main-py)",
      }}
    >
      {/* Left block */}
      <div className="flex flex-col justify-center gap-6 lg:max-w-[55%]">
        <CornerBracket corner="tl" className="text-black" />

        <h1
          className="font-orbitron font-extrabold uppercase"
          style={{
            fontSize: "var(--headline)",
            letterSpacing: "0.08em",
            lineHeight: "1.05",
          }}
        >
          <span className="block">OUTSWIM</span>
          <span className="block">YOUR LIMITS.</span>
          <span className="block">
            OWN THE <span className="underline decoration-4 underline-offset-4">RACE</span>{" "}
            <Checkerboard className="text-black" />
          </span>
        </h1>

        <CornerBracket corner="bl" className="text-black" />

        <div>
          <button
            type="button"
            className="group inline-flex items-center border border-gray-400 rounded-md uppercase font-jakarta transition-colors hover:bg-black hover:text-white hover:border-black"
            style={{
              fontSize: "var(--body)",
              letterSpacing: "0.18em",
              paddingInline: "var(--btn-px)",
              paddingBlock: "var(--btn-py)",
              gap: "var(--btn-gap)",
            }}
          >
            BUILD MY WORKOUT
            <ArrowUpRight
              strokeWidth={1.5}
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              style={{ width: "var(--icon)", height: "var(--icon)" }}
            />
          </button>
        </div>
      </div>

      {/* Right lower feature block */}
      <div className="self-end">
        <div
          className="relative border border-gray-300 rounded-md flex flex-col items-start gap-4"
          style={{
            padding: "var(--feature-pad)",
            minWidth: "var(--feature-min)",
          }}
        >
          <CornerBracket corner="tl" className="absolute -top-px -left-px text-black" />
          <CornerBracket corner="tr" className="absolute -top-px -right-px text-black" />
          <CornerBracket corner="bl" className="absolute -bottom-px -left-px text-black" />
          <CornerBracket corner="br" className="absolute -bottom-px -right-px text-black" />

          <WireframeGlobe className="text-black" />

          <p
            className="font-jakarta font-semibold uppercase"
            style={{ fontSize: "var(--body)", letterSpacing: "0.18em" }}
          >
            UNLEASH YOUR POTENTIAL WITH HIGH-PERFORMANCE SWIM SETS,
            <br />
            TAILORED DRYLAND TRAINING &amp; INSTANT PROGRESS TRACKING.
          </p>
        </div>
      </div>
    </main>
  );
}
