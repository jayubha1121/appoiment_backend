import { Admin } from "../models/admin.model.js";
import { AppError } from "../utils/app-error.js";
import {
  ALL_PERMISSIONS,
  buildAuthUserPayload,
  normalizeUserPermissions,
  normalizeUserRole,
} from "../utils/permissions.js";

export class UserService {
  // ─── List ─────────────────────────────────────────────────────────────────
  // super_admin sees admins + employees only (not themselves / other super_admins)
  // admin sees employees only
  // employee cannot access this endpoint

  async listUsers(actor) {
    const actorRole = normalizeUserRole(actor?.role);
    let filter;
    if (actorRole === "super_admin") {
      filter = { role: { $ne: "super_admin" } };         // admins + employees
    } else if (actorRole === "admin") {
      filter = { role: "employee" };                      // employees only
    } else {
      throw new AppError("Forbidden", 403);
    }
    const users = await Admin.find(filter).sort({ createdAt: -1 });
    return { items: users.map((user) => buildAuthUserPayload(user)) };
  }

  // ─── Create ───────────────────────────────────────────────────────────────
  // super_admin → can create admin or employee.
  // admin       → can only create employee.

  async createUser(actor, payload) {
    const actorRole = normalizeUserRole(actor?.role);
    const email = String(payload.email ?? "").trim().toLowerCase();
    const name = String(payload.name ?? "").trim();
    const password = String(payload.password ?? "").trim();

    let role;
    if (actorRole === "super_admin") {
      const requested = normalizeUserRole(payload.role);
      // super_admin cannot be created directly; must use the transfer mechanism
      role = requested === "super_admin" ? "admin" : requested;
    } else if (actorRole === "admin") {
      role = "employee"; // admins can only create employees
    } else {
      throw new AppError("Insufficient permissions to create users", 403);
    }

    if (await Admin.findOne({ email })) {
      throw new AppError("A user with this email already exists", 409);
    }

    const user = await Admin.create({
      name,
      email,
      password,
      role,
      isActive: payload.isActive !== false,
      permissions: normalizeUserPermissions(role, payload.permissions),
      createdBy: actor?.id ?? null,
    });

    return {
      message: "User created successfully",
      user: buildAuthUserPayload(user),
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  // super_admin → can update admin + employee; can also transfer super_admin role.
  // admin       → can only update employees.

  async updateUser(actor, userId, payload) {
    const actorRole = normalizeUserRole(actor?.role);
    const user = await Admin.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const targetRole = normalizeUserRole(user.role);

    // Protect super_admin: only the super_admin themselves can edit their own profile
    if (targetRole === "super_admin" && String(actor?.id ?? "") !== String(user._id)) {
      throw new AppError("The super admin account can only be edited by the super admin", 403);
    }

    // admin can only edit employees
    if (actorRole === "admin" && targetRole !== "employee") {
      throw new AppError("Admins can only update employee accounts", 403);
    }

    // Cannot change own active status
    if (String(actor?.id ?? "") === String(user._id) && payload.isActive != null) {
      throw new AppError("You cannot change your own active status", 400);
    }

    // Handle super_admin role transfer (super_admin → another user)
    if (payload.role != null && normalizeUserRole(payload.role) === "super_admin") {
      if (actorRole !== "super_admin") {
        throw new AppError("Only the super admin can transfer the super admin role", 403);
      }
      if (String(actor?.id ?? "") === String(user._id)) {
        throw new AppError("Transfer the super admin role to another user, not yourself", 400);
      }

      // Update target → super_admin
      if (payload.name != null) user.name = String(payload.name).trim();
      if (payload.email != null) {
        const nextEmail = String(payload.email).trim().toLowerCase();
        const exists = await Admin.findOne({ email: nextEmail, _id: { $ne: user._id } });
        if (exists) throw new AppError("A user with this email already exists", 409);
        user.email = nextEmail;
      }
      user.role = "super_admin";
      user.permissions = [...ALL_PERMISSIONS];
      user.isActive = true;
      await user.save();

      // Demote current super_admin → admin
      await Admin.updateOne(
        { _id: actor.id },
        { $set: { role: "admin", permissions: [...ALL_PERMISSIONS] } },
      );

      return { message: "Super admin role transferred successfully", user: buildAuthUserPayload(user) };
    }

    // Normal update path
    let nextRole = targetRole;
    if (payload.role != null) {
      const requested = normalizeUserRole(payload.role);
      // admin can only keep targets as employee
      if (actorRole === "admin" && requested !== "employee") {
        throw new AppError("Admins can only set users to employee role", 403);
      }
      nextRole = requested;
    }

    const nextIsActive = payload.isActive != null ? Boolean(payload.isActive) : user.isActive;

    if (payload.email != null) {
      const nextEmail = String(payload.email).trim().toLowerCase();
      const exists = await Admin.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (exists) throw new AppError("A user with this email already exists", 409);
      user.email = nextEmail;
    }

    if (payload.name != null) user.name = String(payload.name).trim();

    user.role = nextRole;
    user.isActive = nextIsActive;
    user.permissions = normalizeUserPermissions(nextRole, payload.permissions ?? user.permissions);
    await user.save();

    return {
      message: "User updated successfully",
      user: buildAuthUserPayload(user),
    };
  }

  // ─── Reset password ────────────────────────────────────────────────────────

  async resetUserPassword(userId, password) {
    const user = await Admin.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    user.password = String(password ?? "").trim();
    await user.save();
    return { message: "Password updated successfully" };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────
  // super_admin accounts can NEVER be deleted.
  // admin       → can only delete employees.
  // super_admin → can delete admins and employees.

  async deleteUser(actor, userId) {
    if (String(actor?.id ?? "") === String(userId)) {
      throw new AppError("You cannot delete your own account", 400);
    }

    const user = await Admin.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const actorRole = normalizeUserRole(actor?.role);
    const targetRole = normalizeUserRole(user.role);

    if (targetRole === "super_admin") {
      throw new AppError("The super admin account cannot be deleted", 403);
    }

    if (actorRole === "admin" && targetRole !== "employee") {
      throw new AppError("Admins can only delete employee accounts", 403);
    }

    await Admin.deleteOne({ _id: user._id });
    return { id: String(user._id) };
  }
}

export const userService = new UserService();
