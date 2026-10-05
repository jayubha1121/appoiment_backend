import { sendSuccess } from "../utils/response.js";
import { userService } from "../services/user.service.js";

export class UserController {
  async listUsers(req, res) {
    const data = await userService.listUsers(req.admin);
    return sendSuccess(res, data);
  }

  async createUser(req, res) {
    const data = await userService.createUser(req.admin, req.body);
    return sendSuccess(res, data, 201);
  }

  async updateUser(req, res) {
    const data = await userService.updateUser(req.admin, req.params.userId, req.body);
    return sendSuccess(res, data);
  }

  async resetUserPassword(req, res) {
    const data = await userService.resetUserPassword(req.params.userId, req.body.password);
    return sendSuccess(res, data);
  }

  async deleteUser(req, res) {
    const data = await userService.deleteUser(req.admin, req.params.userId);
    return sendSuccess(res, data);
  }
}

export const userController = new UserController();