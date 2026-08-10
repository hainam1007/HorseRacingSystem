import { Link, NavLink, Outlet } from "react-router-dom";
import LogoutButton from "../../auth/LogoutButton";
import RoleSwitcher from "../../auth/RoleSwitcher";
import "./owner.css";

const navItems = [
  { label: "Dashboard", to: "/owner", end: true },
  { label: "Horses", to: "/owner/horses" },
  { label: "Registrations", to: "/owner/registrations" },
  { label: "Deposit history", to: "/owner/deposit-history" },
  { label: "Jockeys", to: "/owner/jockeys" },
  { label: "Schedule", to: "/owner/schedule" },
  { label: "Results", to: "/owner/results" },
];

function OwnerLayout() {
  return (
    <main className="owner-page" aria-label="Horse owner workspace">
      <header className="owner-topbar">
        <Link className="brand owner-brand" to="/" aria-label="Horse racing home">
          <span className="brand-mark">HR</span>
          <span className="brand-text">
            <strong>horse</strong>
            <span>racing</span>
          </span>
        </Link>

        <nav className="owner-nav" aria-label="Horse owner sections">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `owner-nav__link ${isActive ? "owner-nav__link--active" : ""}`}
              end={item.end}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="owner-topbar__actions">
          <RoleSwitcher profileTo="/owner/profile" triggerClassName="owner-button owner-button--ghost owner-profile-pill" />
          <LogoutButton className="owner-button owner-button--ghost">Logout</LogoutButton>
        </div>
      </header>

      <div className="owner-content">
        <Outlet />
      </div>
    </main>
  );
}

export default OwnerLayout;
