import { Routes, Route, Navigate } from "react-router-dom";
import MasterPage from "./pages/MasterPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/mestre" replace />} />
      <Route path="/mestre" element={<MasterPage />} />
      <Route path="/:playerId" element={<PlayerPage />} />
      <Route path="*" element={<div style={{ padding: 24 }}>404</div>} />
    </Routes>
  );
}
