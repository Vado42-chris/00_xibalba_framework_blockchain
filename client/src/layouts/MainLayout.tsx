import React from "react";
import { Outlet, Link } from "react-router-dom";

const headerStyle: React.CSSProperties = {
  padding: "12px 20px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  padding: "20px",
  minHeight: "calc(100vh - 112px)", // header + footer estimate
};

const footerStyle: React.CSSProperties = {
  padding: "12px 20px",
  borderTop: "1px solid rgba(255,255,255,0.04)",
  textAlign: "center",
};

const linkStyle: React.CSSProperties = {
  color: "var(--text-primary, #e6eef6)",
  textDecoration: "none",
  fontWeight: 500,
};

const brandStyle: React.CSSProperties = {
  fontWeight: 700,
  letterSpacing: "-0.02em",
};

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-primary, #0b1020)",
  color: "var(--text-primary, #e6eef6)",
  fontFamily:
    'var(--font-family, Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial)',
};

const MainLayout: React.FC = () => {
  return (
    <div style={containerStyle} className="app-root">
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={brandStyle}>Xibalba Alpaca</div>
          <nav style={navStyle} aria-label="Main navigation">
            <Link to="/" style={linkStyle}>
              Home
            </Link>
            <Link to="/desktop" style={linkStyle}>
              Desktop
            </Link>
            <Link to="/search" style={linkStyle}>
              Search
            </Link>
            <Link to="/hybrid" style={linkStyle}>
              Hybrid
            </Link>
            <Link to="/login" style={linkStyle}>
              Login
            </Link>
          </nav>
        </div>

        <div style={{ opacity: 0.8, fontSize: "0.9rem" }}>
          {/* Small status area or future top-right controls */}
          v0.1
        </div>
      </header>

      <main style={mainStyle}>
        <Outlet />
      </main>

      <footer style={footerStyle}>
        <small style={{ color: "var(--text-tertiary, #9aa6b2)" }}>
          © {new Date().getFullYear()} Xibalba Alpaca
        </small>
      </footer>
    </div>
  );
};

export default MainLayout;
