import { slotService } from "../services/slot.service.js";
import { sendSuccess } from "../utils/response.js";

export class SlotController {
  async setSlotActive(req, res) {
    const isActive = req.body.isActive === true || req.body.isActive === "true";
    const data = await slotService.setSlotActive(
      String(req.params.slotId),
      isActive,
    );
    return sendSuccess(res, data);
  }

  async getAvailableSlots(req, res) {
    const data = await slotService.getAllSlotsForBookingPage(
      String(req.params.formId),
      req.query.date ? String(req.query.date) : undefined,
    );
    return sendSuccess(res, data);
  }

  async getFormSlots(req, res) {
    const data = await slotService.getSlotsByFormId(
      String(req.params.formId),
    );
    return sendSuccess(res, data);
  }
}

export const slotController = new SlotController();
