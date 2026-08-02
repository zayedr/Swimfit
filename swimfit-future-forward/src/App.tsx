import { useState } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import SideDrawer from "./components/SideDrawer";
import ImageRevealBackground from "./components/ImageRevealBackground";
import { BG_IMAGE_1, BG_VIDEO_JUMP } from "./lib/constants";
import type { DrawerKind } from "./lib/constants";

function App() {
  const [drawer, setDrawer] = useState<DrawerKind>(null);

  return (
    <div className="min-h-screen bg-white text-black font-jakarta flex flex-col relative overflow-x-hidden">
      {/* First viewport: hero section carries its own background layers. */}
      <div className="relative flex flex-col min-h-[90vh]">
        {/* Mobile/tablet: the same looping jump video (no separate reveal
            layer below lg). Top-anchored so a narrow/tall viewport never
            crops the swimmer's full body. */}
        <video
          className="lg:hidden absolute inset-0 z-0 h-full w-full object-cover"
          style={{ objectPosition: "center top" }}
          src={BG_VIDEO_JUMP}
          poster={BG_IMAGE_1}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
        {/* Desktop hero background video. */}
        <ImageRevealBackground />

        <Header onOpenDrawer={setDrawer} />
        <Hero />
      </div>

      {/* Future sections (pricing / features) append here — nothing above
          this point uses h-screen/overflow-hidden on the root, so the page
          stays freely, standard vertically scrollable. */}

      <SideDrawer kind={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

export default App;
