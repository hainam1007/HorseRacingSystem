import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../api/authApi";
import { clearSession, getStoredSession, saveActiveRole, saveSession } from "./authStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const storedSession = getStoredSession();
  const [token, setToken] = useState(storedSession.token);
  const [user, setUser] = useState(storedSession.user);
  const [roles, setRoles] = useState(storedSession.roles);
  const [profiles, setProfiles] = useState(storedSession.profiles || {});
  const [activeRole, setActiveRoleState] = useState(storedSession.activeRole);
  const [isLoading, setIsLoading] = useState(Boolean(storedSession.token));

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!storedSession.token) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await authApi.me();
        if (cancelled) return;

        const nextRoles = data.roles || [];
        const nextProfiles = data.profiles || {};
        const nextActiveRole = storedSession.activeRole && nextRoles.includes(storedSession.activeRole)
          ? storedSession.activeRole
          : nextRoles.length === 1
            ? nextRoles[0]
            : null;

        setUser(data.user);
        setRoles(nextRoles);
        setProfiles(nextProfiles);
        setActiveRoleState(nextActiveRole);
        saveSession({
          token: storedSession.token,
          user: data.user,
          roles: nextRoles,
          profiles: nextProfiles,
          activeRole: nextActiveRole,
        });
      } catch {
        if (!cancelled) {
          clearSession();
          setToken(null);
          setUser(null);
          setRoles([]);
          setProfiles({});
          setActiveRoleState(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleInvalidAuth = () => {
      clearSession();
      setToken(null);
      setUser(null);
      setRoles([]);
      setProfiles({});
      setActiveRoleState(null);
      setIsLoading(false);
    };

    window.addEventListener("horse-racing-auth-invalid", handleInvalidAuth);
    return () => window.removeEventListener("horse-racing-auth-invalid", handleInvalidAuth);
  }, []);

  const signIn = (data) => {
    const nextToken = data.token;
    const nextUser = data.user;
    const nextRoles = data.roles || [];
    const nextProfiles = data.profiles || {};
    const nextActiveRole = nextRoles.length === 1 ? nextRoles[0] : null;

    setToken(nextToken);
    setUser(nextUser);
    setRoles(nextRoles);
    setProfiles(nextProfiles);
    setActiveRoleState(nextActiveRole);
    saveSession({
      token: nextToken,
      user: nextUser,
      roles: nextRoles,
      profiles: nextProfiles,
      activeRole: nextActiveRole,
    });

    return nextRoles;
  };

  const chooseRole = (role) => {
    if (!roles.includes(role)) {
      return false;
    }

    setActiveRoleState(role);
    saveActiveRole(role);
    return true;
  };

  const signOut = async () => {
    try {
      if (token) {
        await authApi.logout();
      }
    } catch {
      // Local logout should always complete even if the server is unavailable.
    } finally {
      clearSession();
      setToken(null);
      setUser(null);
      setRoles([]);
      setProfiles({});
      setActiveRoleState(null);
    }
  };

  const value = useMemo(() => ({
    token,
    user,
    roles,
    profiles,
    activeRole,
    isAuthenticated: Boolean(token),
    isLoading,
    signIn,
    signOut,
    chooseRole,
  }), [token, user, roles, profiles, activeRole, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
