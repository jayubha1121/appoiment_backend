export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  FORMS_VIEW: "forms.view",
  FORMS_CREATE: "forms.create",
  FORMS_UPDATE: "forms.update",
  FORMS_DELETE: "forms.delete",
  APPOINTMENTS_VIEW: "appointments.view",
  APPOINTMENTS_EXPORT: "appointments.export",
  APPOINTMENTS_DELETE: "appointments.delete",
  INTEGRATIONS_VIEW: "integrations.view",
  INTEGRATIONS_MANAGE: "integrations.manage",
  REPORTS_VIEW: "reports.view",
  REPORTS_RUN: "reports.run",
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const DEFAULT_EMPLOYEE_PERMISSIONS = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.FORMS_VIEW,
  PERMISSIONS.FORMS_CREATE,
  PERMISSIONS.FORMS_UPDATE,
  PERMISSIONS.APPOINTMENTS_VIEW,
  PERMISSIONS.APPOINTMENTS_EXPORT,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.REPORTS_RUN,
];

export function normalizeUserRole(role) {
  const r = String(role ?? "employee").trim().toLowerCase();
  if (r === "super_admin") return "super_admin";
  if (r === "admin") return "admin";
  return "employee";
}

export function normalizeUserPermissions(role, permissions) {
  const normalizedRole = normalizeUserRole(role);

  // super_admin always gets all permissions — non-negotiable
  if (normalizedRole === "super_admin") return [...ALL_PERMISSIONS];

  // admin: use provided permissions; fall back to ALL if none given
  if (normalizedRole === "admin") {
    if (!Array.isArray(permissions) || permissions.length === 0) return [...ALL_PERMISSIONS];
    return [...new Set(permissions.map((item) => String(item ?? "").trim()).filter((item) => ALL_PERMISSIONS.includes(item)))];
  }

  // employee: use provided permissions; fall back to defaults
  const source = Array.isArray(permissions) && permissions.length > 0
    ? permissions
    : DEFAULT_EMPLOYEE_PERMISSIONS;
  return [...new Set(source.map((item) => String(item ?? "").trim()).filter((item) => ALL_PERMISSIONS.includes(item)))];
}

export function buildAuthUserPayload(user) {
  const role = normalizeUserRole(user?.role);
  const permissions = normalizeUserPermissions(role, user?.permissions);

  return {
    id: String(user?._id ?? user?.id ?? ""),
    name: String(user?.name ?? "").trim(),
    email: String(user?.email ?? "").trim().toLowerCase(),
    role,
    permissions,
    isActive: Boolean(user?.isActive ?? true),
  };
}

export function hasPermission(user, permission) {
  const authUser = buildAuthUserPayload(user);
  if (!authUser.isActive) return false;
  // Only super_admin bypasses the permissions array check
  if (authUser.role === "super_admin") return true;
  // admin and employee both checked against their stored permissions array
  return authUser.permissions.includes(permission);
}