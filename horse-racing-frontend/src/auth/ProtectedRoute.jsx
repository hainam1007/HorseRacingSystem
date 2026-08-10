import { Navigate, useLocation } from "react-router-dom";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAuth } from "./AuthContext";
import { getDefaultRoute } from "./roleRoutes";

function ProtectedRoute({ role, children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <LoadingSkeleton ariaLabel="Restoring session" variant="auth" />;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (role && !auth.roles.includes(role)) {
    return <Navigate to={getDefaultRoute(auth.roles)} replace />;
  }

  if (role && auth.activeRole !== role) {
    return <Navigate to="/choose-role" replace state={{ from: location }} />;
  }

  return children;
}

export default ProtectedRoute;
