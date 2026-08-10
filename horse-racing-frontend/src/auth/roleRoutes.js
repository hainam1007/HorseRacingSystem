export const ROLE_ROUTES = {
  admin: "/admin",
  horse_owner: "/owner",
  jockey: "/jockey",
  race_referee: "/referee",
  spectator: "/spectator",
};

export const ROLE_LABELS = {
  admin: "Admin",
  horse_owner: "Horse Owner",
  jockey: "Jockey",
  race_referee: "Race Referee",
  spectator: "Spectator",
};

export function getRoleRoute(role) {
  return ROLE_ROUTES[role] || null;
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function getDefaultRoute(roles = []) {
  const supportedRole = roles.find((role) => getRoleRoute(role));
  return supportedRole ? getRoleRoute(supportedRole) : "/choose-role";
}

export function getPostLoginRoute(roles = []) {
  if (roles.length !== 1) {
    return "/choose-role";
  }

  return getRoleRoute(roles[0]) || "/choose-role";
}

export function getRequiredRoleForPath(pathname = "") {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/owner")) return "horse_owner";
  if (pathname.startsWith("/jockey")) return "jockey";
  if (pathname.startsWith("/referee")) return "race_referee";
  if (pathname.startsWith("/spectator")) return "spectator";
  return null;
}
