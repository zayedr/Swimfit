import { useState } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import SideDrawer from "./components/SideDrawer";
import ImageRevealBackground from "./components/ImageRevealBackground";
import type { DrawerKind } from "./lib/constants";

function App() {
  const [drawer, setDrawer] = useState<DrawerKind>(null);

  return (
    <div className="h-screen w-full overflow-hidden bg-white text-black relative">
      <ImageRevealBackground />

      <div className="relative z-10 h-full flex flex-col">
        <Header onOpenDrawer={setDrawer} />
        <Hero />
      </div>

      <SideDrawer kind={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

export default App;
