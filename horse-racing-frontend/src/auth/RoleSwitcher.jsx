import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, UserRound } from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getRoleLabel, getRoleRoute } from "./roleRoutes";

function RoleSwitcher({ profileTo, triggerClassName = "", showProfileWhenSingle = true }) {
  const { activeRole, chooseRole, roles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const switchRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const hasMultipleRoles = roles.length > 1;
  const isProfilePage = location.pathname.endsWith("/profile");

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!switchRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleRoleChange = (role) => {
    const route = getRoleRoute(role);
    if (!route || !chooseRole(role)) return;
    setIsOpen(false);
    navigate(route);
  };

  if (!hasMultipleRoles && !showProfileWhenSingle) return null;

  // Role switching is intentionally available from profile pages only.
  // Other pages keep the regular Profile action.
  if (!isProfilePage) {
    if (!profileTo) return null;

    return (
      <Link className={`role-switcher__trigger ${triggerClassName}`} to={profileTo}>
        <UserRound size={17} />
        Profile
      </Link>
    );
  }

  if (!hasMultipleRoles) {
    return (
      <Link className={`role-switcher__trigger ${triggerClassName}`} to={profileTo || location.pathname}>
        <UserRound size={17} />
        Profile
      </Link>
    );
  }

  return (
    <div className="role-switcher" ref={switchRef}>
      <button
        aria-expanded={isOpen}
        className={`role-switcher__trigger ${triggerClassName}`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <UserRound size={17} />
        Switch
        <ChevronDown className={isOpen ? "is-open" : ""} size={15} />
      </button>
      {isOpen && (
        <div className="role-switcher__popover" role="menu" aria-label="Switch workspace">
          <div className="role-switcher__heading">
            <span>Workspace</span>
            <small>Switch role</small>
          </div>
          {roles.map((role) => (
            <button
              className={`role-switcher__item ${activeRole === role ? "is-active" : ""}`}
              disabled={!getRoleRoute(role)}
              key={role}
              onClick={() => handleRoleChange(role)}
              role="menuitem"
              type="button"
            >
              <span>{getRoleLabel(role)}</span>
              {activeRole === role && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default RoleSwitcher;
