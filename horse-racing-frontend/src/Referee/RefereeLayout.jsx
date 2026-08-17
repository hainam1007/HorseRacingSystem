import { ClipboardCheck, Flag, Gauge, LogOut, ShieldCheck } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import RoleSwitcher from "../auth/RoleSwitcher";
import "./referee.css";

const navigation = [
  { to: "/referee", end: true, label: "Control desk", icon: Gauge },
  { to: "/referee/races", label: "Assigned races", icon: Flag },
];

function RefereeLayout({ title, eyebrow, description, children, actions }) {
  const { signOut, user } = useAuth();
  const initials = (user?.full_name || "Race Referee").split(" ").map((part) => part[0]).slice(-2).join("").toUpperCase();

  return <main className="admin-page referee-page" aria-label={title}>
    <a className="referee-skip-link" href="#referee-content">Skip to referee content</a>
    <section className="admin-shell referee-shell">
      <aside className="admin-sidebar referee-sidebar">
        <div className="referee-brand-row">
          <Link className="admin-brand__link brand" to="/" aria-label="Horse racing home"><img className="brand-mark" src="/images/horse-logo.png" alt="" /><span className="brand-text"><strong>horse</strong><span>racing</span></span></Link>
          <span className="referee-console-tag">OFFICIAL CONSOLE</span>
        </div>

        <div className="referee-duty-state"><span className="referee-duty-state__signal" aria-hidden="true" /><div><strong>Race operations</strong><span>Authenticated official workspace</span></div></div>

        <nav className="admin-nav referee-nav" aria-label="Referee sections">
          {navigation.map(({ to, end, label, icon: Icon }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : ""}><Icon aria-hidden="true" size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>)}
        </nav>

        <section className="referee-authority" aria-label="Referee authority">
          <div className="referee-authority__heading"><ShieldCheck aria-hidden="true" size={19} /><span>Authority</span></div>
          <p>Start and complete assigned races, record checks and incidents, prepare results, and submit reports.</p>
          <div className="referee-boundary"><ClipboardCheck aria-hidden="true" size={16} /><span>Admin confirms and publishes final results.</span></div>
        </section>

        <div className="admin-user-row referee-user-row"><div className="admin-user-avatar referee-avatar" aria-hidden="true">{initials}</div><div className="admin-user-info"><span className="admin-user-name">{user?.full_name || "Race Referee"}</span><span className="admin-user-role">Assigned race official</span></div><button className="admin-logout-btn" type="button" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut aria-hidden="true" size={17} /></button></div>
      </aside>

      <section className="admin-content referee-content" id="referee-content">
        <header className="admin-header referee-header"><div className="referee-header__copy"><p className="admin-header__eyebrow">{eyebrow}</p><h1>{title}</h1><p className="admin-header__description">{description}</p></div><div className="admin-header__actions"><RoleSwitcher showProfileWhenSingle={false} triggerClassName="admin-header__button admin-header__button--ghost" />{actions}</div></header>
        <div className="referee-content__body">{children}</div>
      </section>
    </section>
  </main>;
}

export default RefereeLayout;
