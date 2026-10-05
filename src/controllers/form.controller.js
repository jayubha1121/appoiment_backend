import { formService } from "../services/form.service.js";
import { sendSuccess } from "../utils/response.js";

export class FormController {
  async getPublicForm(req, res) {
    const data = await formService.getPublicForm(String(req.params.formId));
    return sendSuccess(res, data);
  }

  async createForm(req, res) {
    const data = await formService.createForm(req.body);
    return sendSuccess(res, data, 201);
  }

  async updateForm(req, res) {
    const data = await formService.updateForm(
      String(req.params.formId),
      req.body,
    );
    return sendSuccess(res, data);
  }

  async deleteForm(req, res) {
    const data = await formService.deleteForm(String(req.params.formId));
    return sendSuccess(res, data);
  }

  async getAllForms(_req, res) {
    const data = await formService.getAllForms();
    return sendSuccess(res, data);
  }

}

export const formController = new FormController();
