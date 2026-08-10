import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function LogoutButton({ className, children, title, ariaLabel }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <button
      aria-label={ariaLabel}
      className={className}
      disabled={isLoggingOut}
      onClick={handleLogout}
      title={title}
      type="button"
    >
      {children || (isLoggingOut ? "Logging out..." : "Logout")}
    </button>
  );
}

export default LogoutButton;
