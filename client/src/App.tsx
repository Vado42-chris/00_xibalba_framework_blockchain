import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import DesktopPage from "./pages/Desktop";
import SearchResultsPage from "./pages/SearchResults";
import HybridPanel from "./components/HybridPanel";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/desktop" element={<DesktopPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/hybrid" element={<HybridPanel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
