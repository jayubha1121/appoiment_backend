import { Types } from "mongoose";
import { BookingModel } from "../models/Booking.js";
import { SlotModel } from "../models/Slot.js";
import { AppError } from "../utils/app-error.js";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500];

function normaliseLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : 10;
}

export class BookingRepository {
  async bookSlot(slotId, bookingData) {
    // Use a single atomic findOneAndUpdate to claim the slot.
    // MongoDB document-level writes are atomic, so this works safely on
    // standalone instances without requiring a replica set or transactions.
    // (Transactions / startSession would throw ERR_NOT_SUPPORTED on standalone
    // MongoDB deployments because they require retryable writes.)
    const slot = await SlotModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(slotId),
        formId: new Types.ObjectId(bookingData.formId),
        isActive: true,
        $expr: { $lt: ["$bookedCount", "$capacity"] },
      },
      { $inc: { bookedCount: 1 } },
      { returnDocument: "after" },
    );

    if (!slot) {
      throw new AppError("SLOT_FULL", 409);
    }

    try {
      const booking = await BookingModel.create({
        slotId: slot._id,
        formId: slot.formId,
        name: bookingData.name,
        phone: bookingData.phone,
        address: bookingData.address != null ? String(bookingData.address) : "",
        email: bookingData.email,
        inquiryType: bookingData.inquiryType,
        extraFields: bookingData.extraFields ?? {},
      });
      return booking;
    } catch (error) {
      // Compensate: roll back the slot counter if the booking insert fails.
      await SlotModel.findByIdAndUpdate(slotId, { $inc: { bookedCount: -1 } });
      throw error;
    }
  }

  async findAll(filters) {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = normaliseLimit(filters.limit);
    const query = {};

    if (filters.formId) {
      query.formId = new Types.ObjectId(filters.formId);
    }

    if (filters.slotId) {
      query.slotId = new Types.ObjectId(filters.slotId);
    }

    if (filters.inquiryType) {
      query.inquiryType = filters.inquiryType;
    }

    if (filters.startDate || filters.endDate) {
      query.bookedAt = {};

      if (filters.startDate) {
        query.bookedAt.$gte = new Date(filters.startDate);
      }

      if (filters.endDate) {
        query.bookedAt.$lte = new Date(filters.endDate);
      }
    }

    if (filters.search) {
      const safe = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      query.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { address: regex },
        { inquiryType: regex },
      ];
    }

    const [items, total] = await Promise.all([
      BookingModel.find(query)
        .populate("slotId")
        .populate("formId")
        .sort({ bookedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BookingModel.countDocuments(query),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
      },
    };
  }

  /**
   * Remove a booking and free one seat on its slot (admin).
   */
  async deleteById(bookingId) {
    const id = new Types.ObjectId(bookingId);
    const booking = await BookingModel.findOneAndDelete({ _id: id });
    if (!booking) {
      throw new AppError("Booking not found", 404);
    }
    await SlotModel.findOneAndUpdate(
      { _id: booking.slotId, bookedCount: { $gt: 0 } },
      { $inc: { bookedCount: -1 } },
    );
    return { id: String(booking._id) };
  }

  async findAllForExport(filters) {
    const result = await this.findAll({ ...filters, page: 1, limit: 500 });
    return result.items;
  }
}

export const bookingRepository = new BookingRepository();
export { PAGE_SIZE_OPTIONS };
