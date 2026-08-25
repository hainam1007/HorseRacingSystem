import { Link, NavLink } from "react-router-dom";
import {
  CalendarRange,
  CircleDollarSign,
  FileCheck2,
  FileClock,
  Flag,
  Gauge,
  Gift,
  LogOut,
  MapPin,
  ShieldCheck,
  Trophy,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import LogoutButton from "../auth/LogoutButton";
import RoleSwitcher from "../auth/RoleSwitcher";
import "./admin.css";

const navigationGroups = [
  {
    label: "Command",
    items: [
      { to: "/admin", label: "Overview", icon: Gauge, end: true },
      { to: "/admin/cancellations", label: "Cancellation requests", icon: FileClock },
      { to: "/admin/results", label: "Results", icon: Trophy },
      { to: "/admin/deposits", label: "Deposits", icon: CircleDollarSign },
      { to: "/admin/rewards", label: "Prize rewards", icon: Gift },
    ],
  },
  {
    label: "Competition",
    items: [
      { to: "/admin/tournament", label: "Tournaments", icon: Flag },
      { to: "/admin/schedule", label: "Race schedule", icon: CalendarRange },
      { to: "/admin/racetracks", label: "Racetracks", icon: MapPin },
    ],
  },
  {
    label: "Directory",
    items: [
      { to: "/admin/users", label: "Users & roles", icon: UsersRound },
      { to: "/admin/role-applications", label: "Role applications", icon: FileCheck2 },
      { to: "/admin/jockeys", label: "Jockeys", icon: UserRoundCheck },
      { to: "/admin/referees", label: "Referees", icon: ShieldCheck },
    ],
  },
  {
    label: "Analytics",
    items: [
      { to: "/admin/analytics/horseowner", label: "Horse owner", icon: UsersRound },
      { to: "/admin/analytics/jockey", label: "Jockey", icon: Trophy },
      { to: "/admin/analytics/referee", label: "Referee", icon: ShieldCheck },
      { to: "/admin/analytics/horse", label: "Horse", icon: Trophy },
      { to: "/admin/analytics/bettor", label: "Bettor", icon: CircleDollarSign },
    ],
  },
];

function AdminLayout({ title, eyebrow, description, children, actions }) {
  return (
    <main className="admin-page" aria-label={title}>
      <a className="admin-skip-link" href="#admin-main-content">Skip to main content</a>
      <section className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <Link className="admin-brand__link" to="/admin" aria-label="Horse Racing admin overview">
              <img className="admin-brand__mark" src="/images/horse-logo.png" alt="" aria-hidden="true" />
              <span className="admin-brand__copy">
                <strong>Race control</strong>
                <small>Tournament operations</small>
              </span>
            </Link>
          </div>

          <nav className="admin-nav" aria-label="Admin sections">
            {navigationGroups.map((group) => (
              <div className="admin-nav__group" key={group.label}>
                <p className="admin-nav__label">{group.label}</p>
                <div className="admin-nav__links">
                  {group.items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
                      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="admin-user-row">
            <div className="admin-user-avatar" aria-hidden="true">A</div>
            <div className="admin-user-info">
              <span className="admin-user-name">Administrator</span>
              <span className="admin-user-role">Full operations access</span>
            </div>
            <LogoutButton className="admin-logout-btn" title="Sign out" ariaLabel="Sign out">
              <LogOut size={16} />
            </LogoutButton>
          </div>
        </aside>

        <section className="admin-content" id="admin-main-content">
          <header className="admin-header">
            <div className="admin-header__copy">
              <p className="admin-header__eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p className="admin-header__description">{description}</p>
            </div>
            <div className="admin-header__actions">
              <RoleSwitcher showProfileWhenSingle={false} triggerClassName="admin-header__button admin-header__button--ghost" />
              {actions}
            </div>
          </header>
          {children}
        </section>
      </section>
    </main>
  );
}

export default AdminLayout;
