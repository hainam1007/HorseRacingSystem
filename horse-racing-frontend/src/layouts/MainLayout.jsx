import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import LogoutButton from "../auth/LogoutButton";
import { useAuth } from "../auth/AuthContext";
import RoleSwitcher from "../auth/RoleSwitcher";
import "../App.css";

const MainLayout = () => {
  const location = useLocation();
  const { user } = useAuth();
  const displayName = user?.full_name || user?.email || "Spectator";
  const navItems = [
    { name: "Overview", path: "/spectator" },
    { name: "Tournaments", path: "/spectator/tournaments" },
    { name: "Predictions", path: "/spectator/predictions" },
    { name: "Rewards", path: "/spectator/rewards" },
    { name: "Deposit", path: "/spectator/deposit" },
  ];
  return (
    <div className="page-shell page-shell--spectator" style={{
      backgroundColor: "#3E5B49",
      minHeight: "100vh",
      color: "#f5f7f3",
      display: "flex",
      flexDirection: "column"
    }}>
      {/* Topbar - Exact Landing Page Pattern */}
      <header className="topbar">
        <Link className="brand" to="/spectator" aria-label="Horse racing spectator home">
          <span className="brand-mark">HR</span>
          <span className="brand-text">
            <strong>horse</strong>
            <span>racing</span>
          </span>
        </Link>

        <nav className="nav" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.path === "/spectator"}
              className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}
            >
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <RoleSwitcher profileTo="/spectator/profile" triggerClassName="user-profile-pill" />
          <LogoutButton className="logout-btn">Logout</LogoutButton>
        </div>
      </header>

      <div className="dashboard-container">
        <main className="content-area" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      <footer className="site-footer" aria-label="Site footer">
        <div className="site-footer__signal" aria-hidden="true">
          <span>HORSE RACING TOURNAMENT SYSTEM</span>
          <span>FROM GATE TO FINISH</span>
        </div>

        <div className="site-footer__inner">
          <div className="footer-brand">
            <Link className="brand footer-brand__link" to="/spectator" aria-label="Horse racing spectator home">
              <span className="brand-mark">HR</span>
              <span className="brand-text">
                <strong>horse</strong>
                <span>racing</span>
              </span>
            </Link>
            <h2>Every race.<br />One clear finish.</h2>
            <p className="footer-copy">Follow the field from the opening gate to official results.</p>
          </div>

          <nav className="footer-links" aria-label="Footer navigation">
            <p className="footer-label">Race day</p>
            <ul>
              <li><Link to="/spectator/tournaments"><span>01</span>Tournaments</Link></li>
              <li><Link to="/spectator/predictions"><span>02</span>Predictions</Link></li>
              <li><Link to="/spectator/rewards"><span>03</span>Rewards</Link></li>
              <li><Link to="/spectator/deposit"><span>04</span>Deposit</Link></li>
            </ul>
          </nav>

          <section className="footer-race-call" aria-labelledby="footer-race-call-title">
            <p className="footer-label">Trackside</p>
            <h3 id="footer-race-call-title">Stay close to the action.</h3>
            <p>Check the next card, make your picks, and return for the final standings.</p>
            <Link className="footer-race-call__link" to="/spectator/tournaments">
              View race schedule <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
            </Link>
          </section>
        </div>

        <div className="site-footer__bottom">
          <div className="footer-copyright">© {new Date().getFullYear()} Horse Racing Tournament Management System</div>
          <div className="footer-signoff" aria-hidden="true">
            <span className="footer-finish-line"><span /> FINISH STRONG</span>
          </div>
        </div>
      </footer>

      <style>{`
        .dashboard-container {
          flex: 1;
          box-sizing: border-box;
          padding: 40px 20px;
          max-width: 1200px;
          margin: 0 auto;
          min-width: 0;
          width: 100%;
        }
        .page-shell > .topbar {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 72px;
          padding: 0 4px;
        }
        .page-shell > .topbar .brand,
        .page-shell > .topbar .header-actions {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
        }
        .page-shell > .topbar .nav {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: grid;
          grid-template-columns: repeat(5, minmax(116px, 1fr));
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: min(760px, calc(100vw - 560px));
          min-width: 660px;
          padding: 8px 12px;
          border: 1px solid rgba(238, 231, 212, 0.24);
          border-radius: 999px;
          background: rgba(238, 231, 212, 0.1);
          backdrop-filter: blur(10px);
        }
        .nav-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-width: 0;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 999px;
          color: #E6DDC8;
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          transition: color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
        }
        .nav-link::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(238, 231, 212, 0.2), rgba(238, 231, 212, 0.1));
          opacity: 0;
          transform: scale(0.86);
          transition: opacity 180ms ease, transform 180ms ease;
        }
        .nav-link:hover {
          transform: translateY(-1px);
        }
        .nav-link:hover::before {
          opacity: 1;
          transform: scale(1);
        }
        .nav-link--active {
          color: #3E5B49;
          background: #EEE7D4;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
        }
        .nav-link.nav-link--active:hover,
        .nav-link.nav-link--active:focus-visible {
          color: #3E5B49;
          background: #EEE7D4;
          transform: none;
        }
        .nav-link.nav-link--active::before,
        .nav-link.nav-link--active:hover::before,
        .nav-link.nav-link--active:focus-visible::before {
          opacity: 0;
          transform: scale(0.86);
        }
        .content-area {
          animation: routeEnter 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
          transform-origin: top center;
        }
        @keyframes routeEnter {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.992);
            filter: blur(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        @media (max-width: 1100px) {
          .page-shell > .topbar {
            flex-wrap: wrap;
            row-gap: 14px;
          }
          .page-shell > .topbar .nav {
            position: static;
            order: 3;
            width: 100%;
            min-width: 0;
            grid-template-columns: repeat(5, minmax(118px, 1fr));
            transform: none;
          }
          .nav-link {
            min-width: 0;
          }
        }
        @media (max-width: 640px) {
          .page-shell > .topbar .nav {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            padding: 8px;
            border-radius: 28px;
          }
          .nav-link {
            min-width: 0;
          }
        }
        .user-profile-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          font-size: 0.88rem;
          color: #EEE7D4;
          text-decoration: none;
          transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
        }
        .user-profile-pill:hover {
          background: rgba(238, 231, 212, 0.1);
          border-color: rgba(238, 231, 212, 0.3);
          transform: translateY(-1px);
        }
        .avatar-small {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6e5a45, #c89a69);
        }
        .logout-btn {
          color: #EEE7D4;
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 600;
          padding: 8px 18px;
          border-radius: 999px;
          border: 1px solid rgba(238, 231, 212, 0.3);
          transition: all 160ms ease;
        }
        .logout-btn:hover {
          background: rgba(238, 231, 212, 0.1);
          border-color: #EEE7D4;
        }
      `}</style>
    </div>
  );
};

export default MainLayout;
