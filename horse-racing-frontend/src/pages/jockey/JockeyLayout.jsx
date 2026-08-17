import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Bell, CalendarDays, CheckCircle2, FileText, Send, Trophy } from "lucide-react";
import LogoutButton from "../../auth/LogoutButton";
import RoleSwitcher from "../../auth/RoleSwitcher";
import { useJockeyApiData } from "./useJockeyApiData";
import "./jockey.css";

const navItems = [
  { label: "Dashboard", to: "/jockey", end: true },
  { label: "Invitations", to: "/jockey/invitations" },
  { label: "Schedule", to: "/jockey/schedule" },
  { label: "Assignments", to: "/jockey/assignments" },
  { label: "Results", to: "/jockey/results" },
];

function JockeyLayout() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef(null);
  const { invitations, schedule, results } = useJockeyApiData();
  const pendingInvitations = invitations.filter((item) => item.rawStatus === "meeting_invited");
  const termReviews = invitations.filter((item) => item.rawStatus === "terms_pending_confirmation");
  const contractReviews = invitations.filter((item) => item.rawStatus === "contract_uploaded");
  const nextRace = schedule[0];
  const latestResult = results[0];
  const notifications = [
    ...pendingInvitations.slice(0, 2).map((item) => ({
      icon: Send,
      title: `${item.horse} invitation needs your response.`,
      meta: item.race,
      to: "/jockey/invitations",
    })),
    ...termReviews.slice(0, 2).map((item) => ({
      icon: FileText,
      title: `${item.horse} terms need your confirmation.`,
      meta: item.race,
      to: "/jockey/invitations",
    })),
    ...contractReviews.slice(0, 2).map((item) => ({
      icon: FileText,
      title: `${item.horse} contract is ready for review.`,
      meta: item.contractFileName || item.race,
      to: "/jockey/invitations",
    })),
    ...(nextRace ? [{
      icon: CalendarDays,
      title: `${nextRace.race} is next on your schedule.`,
      meta: nextRace.time,
      to: "/jockey/schedule",
    }] : []),
    ...(latestResult ? [{
      icon: Trophy,
      title: `${latestResult.race} result has been published.`,
      meta: latestResult.prize,
      to: "/jockey/results",
    }] : []),
  ].slice(0, 4);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <main className="jockey-page" aria-label="Jockey athlete workspace">
      <header className="jockey-topbar">
        <Link className="brand jockey-brand" to="/" aria-label="Horse racing home">
          <img className="brand-mark" src="/images/horse-logo.png" alt="" />
          <span className="brand-text">
            <strong>horse</strong>
            <span>racing</span>
          </span>
        </Link>

        <nav className="jockey-nav" aria-label="Jockey sections">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `jockey-nav__link ${isActive ? "jockey-nav__link--active" : ""}`}
              end={item.end}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="jockey-topbar__actions">
          <div className="jockey-notification-menu" ref={notificationsRef}>
            <button
              aria-expanded={notificationsOpen}
              aria-label="Jockey notifications"
              className="jockey-icon-button jockey-notification-trigger"
              onClick={() => setNotificationsOpen((current) => !current)}
              type="button"
            >
              <Bell size={18} />
              {notifications.length > 0 && <span>{notifications.length}</span>}
            </button>

            <aside className={`jockey-notification-popover ${notificationsOpen ? "is-open" : ""}`} aria-label="Jockey notification list">
              <div className="jockey-notification-popover__header">
                <div>
                  <span className="jockey-kicker">Notifications</span>
                  <h2>Race alerts</h2>
                </div>
                <span className="jockey-badge jockey-badge--amber">{notifications.length} new</span>
              </div>

              <div className="jockey-notification-popover__list">
                {notifications.map((item, index) => {
                  const Icon = item.icon || CheckCircle2;
                  return (
                  <Link className="jockey-notification-item" key={`${item.title}-${index}`} onClick={() => setNotificationsOpen(false)} to={item.to}>
                    <span className="jockey-notification-item__icon"><Icon size={16} /></span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.meta || "Live workspace"}</small>
                    </span>
                  </Link>
                  );
                })}
                {notifications.length === 0 && (
                  <div className="jockey-notification-empty">
                    <CheckCircle2 size={18} />
                    <span>No current race alerts.</span>
                  </div>
                )}
              </div>

              <Link className="jockey-notification-popover__footer" onClick={() => setNotificationsOpen(false)} to="/jockey/profile">
                View profile notifications
              </Link>
            </aside>
          </div>

          <RoleSwitcher profileTo="/jockey/profile" triggerClassName="jockey-button jockey-button--ghost jockey-profile-pill" />
          <LogoutButton className="jockey-button jockey-button--ghost">Logout</LogoutButton>
        </div>
      </header>

      <div className="jockey-content">
        <Outlet />
      </div>
    </main>
  );
}

export default JockeyLayout;
