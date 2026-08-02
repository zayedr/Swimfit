import { useState } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import SideDrawer from "./components/SideDrawer";
import ImageRevealBackground from "./components/ImageRevealBackground";
import { BG_IMAGE_1 } from "./lib/constants";
import type { DrawerKind } from "./lib/constants";

function App() {
  const [drawer, setDrawer] = useState<DrawerKind>(null);

  return (
    <div className="min-h-screen bg-white text-black font-jakarta flex flex-col relative overflow-x-hidden">
      {/* First viewport: hero section carries its own background layers. */}
      <div className="relative flex flex-col min-h-[90vh]">
        {/* Mobile/tablet static image (no interactive reveal below lg). */}
        <div
          className="lg:hidden absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${BG_IMAGE_1})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
          aria-hidden="true"
        />
        {/* Desktop interactive dual-image reveal. */}
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
