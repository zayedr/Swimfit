import { ArrowUpRight } from "lucide-react";

const SPECS = ["FINA Approved", "Hydrodynamic Design", "Custom Fit"];

export default function Hero() {
  return (
    <main className="relative z-10 flex-1 px-6 md:px-10">
      {/* Meta grid — floating above the background */}
      <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3 md:gap-8 md:pt-4">
        <div>
          <span className="text-xs md:text-sm uppercase tracking-widest text-black/50">
            EQUIPMENT
          </span>
        </div>
        <div>
          <p className="text-xs text-black/70 max-w-[200px]">
            Beyond trends. Built for the water.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          {SPECS.map((spec) => (
            <span key={spec} className="text-xs uppercase tracking-wide text-black/70">
              {spec}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom section — fixed to the bottom of the viewport */}
      <div className="absolute inset-x-0 bottom-0 px-6 md:px-10 pb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <h1 className="font-oswald font-bold uppercase leading-[0.85] text-[2.75rem] sm:text-[4rem] lg:text-[7rem]">
          OUTSWIM
          <br />
          YOUR LIMITS
        </h1>

        <button
          type="button"
          className="group flex items-center gap-2 border border-black px-6 py-3 uppercase text-sm tracking-wide transition-all hover:bg-black hover:text-white shrink-0"
        >
          START TRAINING
          <ArrowUpRight
            className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </button>
      </div>
    </main>
  );
}
