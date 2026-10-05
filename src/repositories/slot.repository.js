import { Types } from "mongoose";
import { SlotModel } from "../models/Slot.js";

export class SlotRepository {
  findById(slotId) {
    return SlotModel.findById(slotId);
  }

  findByFormId(formId) {
    return SlotModel.find({ formId: new Types.ObjectId(formId), isActive: true })
      .sort({ date: 1, startTime: 1 })
      .lean();
  }

  findAllByFormId(formId) {
    return SlotModel.find({ formId: new Types.ObjectId(formId) })
      .sort({ date: 1, startTime: 1 })
      .lean();
  }

  async setSlotActive(slotId, isActive) {
    return SlotModel.findOneAndUpdate(
      { _id: new Types.ObjectId(slotId), bookedCount: 0 },
      { $set: { isActive } },
      { new: true },
    ).lean();
  }

  findByFormIdAndDate(formId, yyyyMmDd) {
    const start = new Date(`${yyyyMmDd}T00:00:00.000Z`);
    const end = new Date(`${yyyyMmDd}T23:59:59.999Z`);
    return SlotModel.find({
      formId: new Types.ObjectId(formId),
      isActive: true,
      date: { $gte: start, $lte: end },
    })
      .sort({ startTime: 1 })
      .lean();
  }
}

export const slotRepository = new SlotRepository();
