import { analyticsService } from "../services/analytics.service.js";
import { sendSuccess } from "../utils/response.js";

export class AnalyticsController {
  async getOverview(_req, res) {
    const data = await analyticsService.getOverview();
    return sendSuccess(res, data);
  }

  async getVisits(req, res) {
    const data = await analyticsService.getVisitsTrend({
      range: req.query.range,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    return sendSuccess(res, data);
  }

  async getBookingsBySlot(_req, res) {
    const data = await analyticsService.getBookingsBySlot();
    return sendSuccess(res, data);
  }
}

export const analyticsController = new AnalyticsController();
