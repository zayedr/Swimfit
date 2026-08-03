import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import WorkoutsPage from "./pages/WorkoutsPage";
import GymPage from "./pages/GymPage";
import CoachPage from "./pages/CoachPage";
import TrackerPage from "./pages/TrackerPage";
import PricingPage from "./pages/PricingPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/workouts" element={<WorkoutsPage />} />
      <Route path="/gym" element={<GymPage />} />
      <Route path="/coach" element={<CoachPage />} />
      <Route path="/tracker" element={<TrackerPage />} />
      <Route path="/pricing" element={<PricingPage />} />
    </Routes>
  );
}

export default App;
