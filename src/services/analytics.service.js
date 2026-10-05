import { BookingModel } from "../models/Booking.js";
import { FormModel } from "../models/Form.js";
import { SlotModel } from "../models/Slot.js";
import { VisitModel } from "../models/Visit.js";
import { subDays } from "./date.service.js";

function toRange(query) {
  const now = new Date();

  if (query.range === "30d") {
    return { start: subDays(now, 29), end: now };
  }

  if (query.range === "custom" && query.startDate && query.endDate) {
    return {
      start: new Date(query.startDate),
      end: new Date(query.endDate),
    };
  }

  return { start: subDays(now, 6), end: now };
}

export class AnalyticsService {
  async getOverview() {
    const [totalVisits, totalBookings, slotStats, activeForms] = await Promise.all([
      VisitModel.countDocuments(),
      BookingModel.countDocuments(),
      SlotModel.aggregate([
        {
          $group: {
            _id: null,
            totalCapacity: { $sum: "$capacity" },
            totalBooked: { $sum: "$bookedCount" },
            activeSlots: {
              $sum: {
                $cond: [{ $eq: ["$isActive", true] }, 1, 0],
              },
            },
          },
        },
      ]),
      FormModel.countDocuments({ isActive: true }),
    ]);

    const stats = slotStats[0] ?? { totalCapacity: 0, totalBooked: 0, activeSlots: 0 };
    const conversionRate = totalVisits === 0 ? 0 : (totalBookings / totalVisits) * 100;
    const slotsFilledPercentage =
      stats.totalCapacity === 0 ? 0 : (stats.totalBooked / stats.totalCapacity) * 100;

    return {
      totalVisits,
      totalBookings,
      conversionRate: Number(conversionRate.toFixed(2)),
      slotsAvailable: Math.max(stats.totalCapacity - stats.totalBooked, 0),
      slotsFilledPercentage: Number(slotsFilledPercentage.toFixed(2)),
      activeForms,
      activeSlots: stats.activeSlots,
    };
  }

  getVisitsTrend(query) {
    const range = toRange(query);

    return VisitModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: range.start,
            $lte: range.end,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          visits: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          visits: 1,
        },
      },
    ]);
  }

  getBookingsBySlot() {
    return BookingModel.aggregate([
      {
        $group: {
          _id: "$slotId",
          totalBookings: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "slots",
          localField: "_id",
          foreignField: "_id",
          as: "slot",
        },
      },
      { $unwind: "$slot" },
      {
        $project: {
          _id: 0,
          slotId: "$slot._id",
          label: {
            $concat: ["$slot.startTime", " - ", "$slot.endTime"],
          },
          totalBookings: 1,
          date: "$slot.date",
          capacity: "$slot.capacity",
        },
      },
      { $sort: { date: 1, label: 1 } },
    ]);
  }
}

export const analyticsService = new AnalyticsService();
