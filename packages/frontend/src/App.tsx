import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/invoices" element={<Invoices />} />
      </Routes>
    </div>
  );
}
