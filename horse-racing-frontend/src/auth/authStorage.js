const TOKEN_KEY = "horse_racing_token";
const USER_KEY = "horse_racing_user";
const ROLES_KEY = "horse_racing_roles";
const PROFILES_KEY = "horse_racing_profiles";
const ACTIVE_ROLE_KEY = "horse_racing_active_role";
const ROLE_INTENT_KEY = "horse_racing_role_intent";

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredSession() {
  return {
    token: localStorage.getItem(TOKEN_KEY),
    user: readJson(USER_KEY, null),
    roles: readJson(ROLES_KEY, []),
    profiles: readJson(PROFILES_KEY, {}),
    activeRole: localStorage.getItem(ACTIVE_ROLE_KEY),
  };
}

export function saveSession({ token, user, roles, profiles, activeRole }) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles || []));
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles || {}));

  if (activeRole) {
    localStorage.setItem(ACTIVE_ROLE_KEY, activeRole);
  } else {
    localStorage.removeItem(ACTIVE_ROLE_KEY);
  }
}

export function saveActiveRole(role) {
  if (role) {
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
  } else {
    localStorage.removeItem(ACTIVE_ROLE_KEY);
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLES_KEY);
  localStorage.removeItem(PROFILES_KEY);
  localStorage.removeItem(ACTIVE_ROLE_KEY);
}

export function saveRoleApplicationIntent(role, email) {
  if (!role || role === "spectator" || role === "admin") {
    localStorage.removeItem(ROLE_INTENT_KEY);
    return;
  }

  localStorage.setItem(ROLE_INTENT_KEY, JSON.stringify({
    role,
    email: email || "",
    createdAt: Date.now(),
  }));
}

export function getRoleApplicationIntent(email) {
  const intent = readJson(ROLE_INTENT_KEY, null);

  if (!intent?.role) {
    return null;
  }

  if (email && intent.email && intent.email.toLowerCase() !== email.toLowerCase()) {
    return null;
  }

  return intent;
}

export function clearRoleApplicationIntent() {
  localStorage.removeItem(ROLE_INTENT_KEY);
}
