import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAuth } from "./AuthContext";
import { getDefaultRoute, getRequiredRoleForPath, getRoleLabel, getRoleRoute } from "./roleRoutes";

function WorkspaceChooser() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (auth.isLoading) {
    return <LoadingSkeleton ariaLabel="Restoring session" variant="auth" />;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (auth.roles.length === 1 && getRoleRoute(auth.roles[0])) {
    return <Navigate to={getDefaultRoute(auth.roles)} replace />;
  }

  const chooseRole = (role) => {
    const route = getRoleRoute(role);
    if (!route || !auth.chooseRole(role)) return;

    const requestedPath = location.state?.from?.pathname;
    const requestedRole = getRequiredRoleForPath(requestedPath);
    const nextRoute = requestedRole === role ? requestedPath : route;

    navigate(nextRoute, { replace: true });
  };

  return (
    <main className="workspace-page" aria-label="Choose workspace">
      <section className="workspace-panel">
        <div className="workspace-panel__header">
          <p className="workspace-eyebrow">Workspace Access</p>
          <h1>Choose your racing workspace</h1>
          <p>
            {auth.user?.full_name || auth.user?.email || "Your account"} has multiple roles.
            Pick the workspace you want to open for this session.
          </p>
        </div>

        <div className="workspace-grid">
          {auth.roles.map((role) => {
            const route = getRoleRoute(role);
            return (
              <button
                className={`workspace-card ${route ? "" : "workspace-card--disabled"}`}
                disabled={!route}
                key={role}
                onClick={() => chooseRole(role)}
                type="button"
              >
                <span>{route ? <ArrowRight size={18} /> : <ShieldAlert size={18} />}</span>
                <strong>{getRoleLabel(role)}</strong>
                <small>{route ? "Open workspace" : "Workspace not available yet"}</small>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default WorkspaceChooser;
