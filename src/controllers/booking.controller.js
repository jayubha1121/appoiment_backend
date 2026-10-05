import { bookingService } from "../services/booking.service.js";
import { sendSuccess } from "../utils/response.js";
import {
  mapBookingLeanToCsvRow,
  buildCsvColumnsWithCustomFields,
  addExtraFieldsToRow,
  stringifyBookingCsvWithCols,
} from "../utils/booking-export-csv.shared.js";
import { withUtf8Bom } from "../utils/csvUtf8Bom.shared.js";

function buildFilters(query) {
  return {
    formId: query.formId,
    slotId: query.slotId,
    inquiryType: query.inquiryType,
    search: query.search,
    startDate: query.startDate,
    endDate: query.endDate,
    page: query.page ? Number(query.page) : undefined,
    limit: query.limit ? Number(query.limit) : undefined,
  };
}

export class BookingController {
  async createBooking(req, res) {
    const data = await bookingService.createBooking(req.body);
    return sendSuccess(res, data, 201);
  }

  async getBookings(req, res) {
    const data = await bookingService.getAllBookings(buildFilters(req.query));
    return sendSuccess(res, data);
  }

  async deleteBooking(req, res) {
    const data = await bookingService.deleteBooking(req.params.bookingId);
    return sendSuccess(res, data);
  }

  async exportBookings(req, res) {
    const items = await bookingService.getBookingsForExport(
      buildFilters(req.query),
    );

    const allCustomFields = items
      .map((item) => item?.formId?.customFields)
      .filter(Boolean);

    const columns = buildCsvColumnsWithCustomFields(allCustomFields);

    const rows = items.map((item) => {
      const row = mapBookingLeanToCsvRow(item);
      return addExtraFieldsToRow(row, item?.extraFields);
    });

    const csv = stringifyBookingCsvWithCols(rows, { columns });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="appointments.csv"',
    );
    res.status(200).send(withUtf8Bom(csv));
  }
}

export const bookingController = new BookingController();
