import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type {
  DailyAnalyticsBookingRow,
  DailyAnalyticsReport,
  DailyAnalyticsShowRow,
} from "../dailyAnalytics.ts";

const templatePath = path.join(
  process.cwd(),
  "src",
  "templates",
  "Zingara_Daily_Analytics_Master_Template.xlsx",
);

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stringCell(reference: string, value: string, style?: number) {
  return `<x:c r="${reference}"${style === undefined ? "" : ` s="${style}"`} t="str"><x:v>${xml(value)}</x:v></x:c>`;
}

function numberCell(reference: string, value: number, style?: number) {
  const finiteValue = Number.isFinite(value) ? value : 0;
  return `<x:c r="${reference}"${style === undefined ? "" : ` s="${style}"`} t="n"><x:v>${finiteValue}</x:v></x:c>`;
}

function formulaCell(
  reference: string,
  formula: string,
  result: number,
  style?: number,
) {
  return `<x:c r="${reference}"${style === undefined ? "" : ` s="${style}"`} t="n"><x:f>${xml(formula)}</x:f><x:v>${Number.isFinite(result) ? result : 0}</x:v></x:c>`;
}

function row(
  number: number,
  cells: string[],
  options: { height?: number } = {},
) {
  const height = options.height
    ? ` ht="${options.height}" customHeight="1"`
    : "";
  return `<x:row r="${number}"${height}>${cells.join("")}</x:row>`;
}

function excelDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 12) / 86_400_000 + 25_569;
}

function replaceSheetData(source: string, rows: string[]) {
  const next = `<x:sheetData>${rows.join("")}</x:sheetData>`;
  if (/<x:sheetData\s*\/>/.test(source)) {
    return source.replace(/<x:sheetData\s*\/>/, next);
  }
  return source.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/, next);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+02:00`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "ZAR",
  })
    .format(value)
    .replace("ZAR", "R")
    .trim();
}

function showLabel(show: DailyAnalyticsShowRow) {
  return `${formatDate(show.performanceDate)} | ${show.location}`;
}

function bestShow(
  shows: DailyAnalyticsShowRow[],
  value: (show: DailyAnalyticsShowRow) => number,
) {
  return [...shows].sort(
    (left, right) =>
      value(right) - value(left) ||
      left.performanceDate.localeCompare(right.performanceDate) ||
      left.location.localeCompare(right.location),
  )[0];
}

function largestBooking(
  bookings: DailyAnalyticsBookingRow[],
  value: (booking: DailyAnalyticsBookingRow) => number,
) {
  return [...bookings].sort(
    (left, right) =>
      value(right) - value(left) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.bookingReference.localeCompare(right.bookingReference),
  )[0];
}

function buildSummaryRows(report: DailyAnalyticsReport) {
  const { summary, payments } = report;
  const lastBookingRow = Math.max(7, report.bookingRows.length + 6);
  const largestByPax = largestBooking(report.bookingRows, (booking) => booking.pax);
  const largestByValue = largestBooking(
    report.bookingRows,
    (booking) => booking.grossValue,
  );
  const mostBookedZone = [...report.seatingRows].sort(
    (left, right) => right.bookings - left.bookings,
  )[0];
  const highestValueZone = [...report.seatingRows].sort(
    (left, right) => right.grossValue - left.grossValue,
  )[0];
  const furthestShow = [...report.showRows].sort((left, right) =>
    right.performanceDate.localeCompare(left.performanceDate),
  )[0];
  const contactRate = summary.distinctCustomers
    ? Math.round(
        (summary.completeContactCustomers / summary.distinctCustomers) * 100,
      )
    : 0;
  const paymentCompletion = summary.totalBookings
    ? payments.successfulPayments / summary.totalBookings
    : 0;
  const rows = [
    row(
      1,
      [
        stringCell(
          "A1",
          `ZINGARA DAY ${report.dayNumber} | LIVE PLATFORM ANALYTICS`,
          3,
        ),
      ],
      { height: 32 },
    ),
    row(
      2,
      [
        stringCell(
          "A2",
          `Authoritative Production activity | ${formatDate(report.reportDate)} 00:00 to 23:59:59 SAST | Read-only snapshot`,
          6,
        ),
        stringCell("J2", "Booking status", 59),
        stringCell("K2", "Bookings", 59),
      ],
      { height: 26 },
    ),
    row(3, [
      stringCell("J3", "Confirmed"),
      formulaCell("K3", "'BOOKINGS'!B5", summary.confirmed),
    ]),
    row(4, [
      stringCell("A4", "GENUINE ONLINE BOOKINGS", 9),
      stringCell("C4", "GUESTS BOOKED", 9),
      stringCell("E4", "GROSS BOOKING VALUE", 9),
      stringCell("G4", "SUCCESSFULLY PAID", 9),
      stringCell("J4", "Pending Payment"),
      formulaCell("K4", "'BOOKINGS'!C5", summary.pending),
    ]),
    row(5, [
      formulaCell("A5", "'BOOKINGS'!A5", summary.totalBookings, 24),
      formulaCell("C5", "'BOOKINGS'!E5", summary.guests, 24),
      formulaCell("E5", "'BOOKINGS'!F5", summary.grossValue, 36),
      formulaCell("G5", "'PAYMENTS'!B5", payments.successfulApplied, 36),
      stringCell("J5", "Cancelled"),
      formulaCell("K5", "'BOOKINGS'!D5", summary.cancelled),
    ]),
    row(8, [
      stringCell("A8", "CONFIRMED BOOKINGS", 9),
      stringCell("C8", "PENDING PAYMENT", 9),
      stringCell("E8", "ACTIVE OUTSTANDING", 9),
      stringCell("G8", "PAYMENT COMPLETION", 9),
    ]),
    row(9, [
      formulaCell("A9", "'BOOKINGS'!B5", summary.confirmed, 24),
      formulaCell("C9", "'BOOKINGS'!C5", summary.pending, 24),
      formulaCell("E9", "'BOOKINGS'!H5", summary.outstanding, 36),
      formulaCell(
        "G9",
        "IFERROR('PAYMENTS'!A5/'BOOKINGS'!A5,0)",
        paymentCompletion,
        48,
      ),
    ]),
    row(12, [stringCell("A12", "COMMERCIAL SNAPSHOT", 55)], { height: 24 }),
    row(
      13,
      [
        stringCell("A13", "Metric", 59),
        stringCell("B13", "Value", 59),
        stringCell("C13", "Interpretation", 59),
      ],
      { height: 26 },
    ),
    row(14, [
      stringCell("A14", "Average booking value", 62),
      formulaCell(
        "B14",
        `IFERROR('BOOKINGS'!F5/'BOOKINGS'!A5,0)`,
        summary.totalBookings ? summary.grossValue / summary.totalBookings : 0,
        63,
      ),
      stringCell("C14", "Gross value per genuine online booking", 62),
    ]),
    row(15, [
      stringCell("A15", "Average pax per booking", 64),
      formulaCell(
        "B15",
        `IFERROR('BOOKINGS'!E5/'BOOKINGS'!A5,0)`,
        summary.totalBookings ? summary.guests / summary.totalBookings : 0,
        65,
      ),
      stringCell("C15", "Guests per genuine online booking", 64),
    ]),
    row(16, [
      stringCell("A16", "Largest booking", 64),
      numberCell("B16", largestByPax?.pax ?? 0, 65),
      stringCell(
        "C16",
        largestByPax
          ? `${largestByPax.pax} guests | ${largestByPax.seatingZone} | ${formatDate(largestByPax.performanceDate)}`
          : "No genuine online bookings",
        64,
      ),
    ]),
    row(17, [
      stringCell("A17", "Largest booking value", 64),
      numberCell("B17", largestByValue?.grossValue ?? 0, 66),
      stringCell(
        "C17",
        largestByValue
          ? `Highest-value booking | reference ${largestByValue.bookingReference}`
          : "No genuine online bookings",
        64,
      ),
    ]),
    row(18, [
      stringCell("A18", "Performances booked", 64),
      numberCell("B18", report.showRows.length, 64),
      stringCell("C18", "Distinct show date/time combinations", 64),
    ]),
    row(19, [
      stringCell("A19", "Distinct real customers", 64),
      numberCell("B19", summary.distinctCustomers, 64),
      stringCell(
        "C19",
        `${summary.newCustomers} new | ${summary.returningCustomers} returning`,
        64,
      ),
    ]),
    row(20, [
      stringCell("A20", "Complete contact profiles", 64),
      numberCell("B20", summary.completeContactCustomers, 64),
      stringCell(
        "C20",
        `${contactRate}% of distinct genuine customers`,
        64,
      ),
    ]),
    row(21, [
      stringCell("A21", "Refunds", 64),
      numberCell("B21", payments.refunds, 64),
      stringCell(
        "C21",
        payments.refunds
          ? `${payments.refunds} refund record(s) in the booking cohort`
          : `No Day ${report.dayNumber} refunds on genuine public bookings`,
        64,
      ),
    ]),
    row(22, [
      stringCell("A22", "Active booking value", 67),
      numberCell("B22", summary.activeBookingValue, 68),
      stringCell(
        "C22",
        "Gross value excluding cancelled/refunded bookings",
        67,
      ),
    ]),
    row(
      23,
      [
        stringCell(
          "A23",
          `DAY ${report.dayNumber} AT A GLANCE | EMAIL-READY`,
          55,
        ),
      ],
      { height: 24 },
    ),
    row(
      24,
      [
        stringCell(
          "A24",
          `• ${summary.totalBookings} genuine online bookings brought ${summary.guests} guests into the Zingara pipeline on Day ${report.dayNumber}.`,
          72,
        ),
      ],
      { height: 27 },
    ),
    row(
      25,
      [
        stringCell(
          "A25",
          `• Gross booking value reached ${formatMoney(summary.grossValue)} across the full SAST calendar day.`,
          75,
        ),
      ],
      { height: 27 },
    ),
    row(
      26,
      [
        stringCell(
          "A26",
          `• ${summary.confirmed} bookings were confirmed, with ${formatMoney(payments.successfulApplied)} successfully applied to Day ${report.dayNumber} bookings by cutoff.`,
          72,
        ),
      ],
      { height: 27 },
    ),
    row(
      27,
      [
        stringCell(
          "A27",
          `• ${payments.successfulPayments} successful booking-cohort payments comprised ${payments.fullPayments} full payments and ${payments.depositPayments} deposits.`,
          75,
        ),
      ],
      { height: 27 },
    ),
    row(
      28,
      [
        stringCell(
          "A28",
          `• Guests booked across ${report.showRows.length} performances${furthestShow ? `, reaching as far ahead as ${formatDate(furthestShow.performanceDate)}` : ""}.`,
          72,
        ),
      ],
      { height: 27 },
    ),
    row(
      29,
      [
        stringCell(
          "A29",
          mostBookedZone && highestValueZone
            ? `• ${mostBookedZone.zone} led demand with ${mostBookedZone.bookings} bookings and ${mostBookedZone.pax} guests; ${highestValueZone.zone} led value at ${formatMoney(highestValueZone.grossValue)}.`
            : "• No seating demand was recorded.",
          75,
        ),
      ],
      { height: 27 },
    ),
    row(
      30,
      [
        stringCell(
          "A30",
          largestByPax
            ? `• The largest online booking was ${largestByPax.pax} guests worth ${formatMoney(largestByPax.grossValue)} for ${largestByPax.seatingZone}.`
            : "• No online bookings were recorded.",
          72,
        ),
      ],
      { height: 27 },
    ),
    row(
      31,
      [
        stringCell(
          "A31",
          `• ${summary.newCustomers} new customers joined and ${summary.returningCustomers} returned; ${summary.completeContactCustomers} of ${summary.distinctCustomers} distinct customers had complete contact details.`,
          75,
        ),
      ],
      { height: 27 },
    ),
    row(
      32,
      [
        stringCell(
          "A32",
          `• ${report.operations.tickets} ticket records, ${report.operations.walletRegistrations} Apple Wallet registrations and ${report.operations.communications} genuine communications supported Day ${report.dayNumber} activity.`,
          72,
        ),
      ],
      { height: 27 },
    ),
    row(35, [stringCell("A35", "DATA BOUNDARY & REPORTING CONTEXT", 55)], {
      height: 24,
    }),
    row(36, [
      stringCell("A36", "Included", 78),
      stringCell(
        "B36",
        "Only booking_origin = customer_public and booking_source = online, created from 00:00 to 23:59:59 SAST",
        77,
      ),
    ]),
    row(37, [
      stringCell("A37", "Excluded", 81),
      stringCell(
        "B37",
        `${report.excluded.checkoutResidues} expired/superseded checkout holds${report.excluded.synthetic ? ` and ${report.excluded.synthetic} conclusively synthetic QA/test records` : ""} excluded`,
        80,
      ),
    ]),
    row(38, [
      stringCell("A38", "Excluded", 78),
      stringCell(
        "B38",
        `${report.excluded.otherActivity} other non-public/Admin/Corporate records excluded`,
        77,
      ),
    ]),
    row(39, [
      stringCell("A39", "Separated", 82),
      stringCell(
        "B39",
        `${payments.paymentsReceivedOnReportDate} successful payments were received that day; ${payments.olderBookingPaymentsReceived} belonged to older bookings (${formatMoney(payments.olderBookingPaymentsReceivedValue)})`,
        80,
      ),
    ]),
    row(40, [
      stringCell("A40", "Excluded", 83),
      stringCell(
        "B40",
        "Bookings were not counted merely because their performance occurred on this reporting date",
        77,
      ),
    ]),
    row(41, [
      stringCell("A41", "Operations", 82),
      stringCell(
        "B41",
        `${report.operations.tickets} ticket records | ${report.operations.communications} genuine communications | ${report.operations.walletRegistrations} Apple Wallet registrations`,
        80,
      ),
    ]),
    row(42, [
      stringCell("A42", "Limitation", 83),
      stringCell(
        "B42",
        "No GA4: visitor count, page views, and website-to-booking conversion are not reported",
        77,
      ),
    ]),
    row(43, [
      stringCell("A43", "Limitation", 82),
      stringCell(
        "B43",
        "Payment rail subtype is not stored authoritatively; card and mobile-wallet shares are not reported",
        80,
      ),
    ]),
  ];
  return { lastBookingRow, rows };
}

function buildBookingRows(report: DailyAnalyticsReport) {
  const last = Math.max(7, report.bookingRows.length + 6);
  const rows = [
    row(1, [stringCell("A1", `DAY ${report.dayNumber} BOOKINGS`, 3)], {
      height: 32,
    }),
    row(
      2,
      [
        stringCell(
          "A2",
          "Genuine public/online bookings only | Customer PII excluded | Times shown in SAST",
          6,
        ),
      ],
      { height: 24 },
    ),
    row(
      4,
      ["Bookings", "Confirmed", "Pending", "Cancelled", "Pax", "Gross", "Paid", "Outstanding"].map(
        (label, index) => stringCell(`${String.fromCharCode(65 + index)}4`, label, 59),
      ),
      { height: 26 },
    ),
    row(5, [
      formulaCell("A5", `COUNTA(B7:B${last})`, report.summary.totalBookings, 84),
      formulaCell("B5", `COUNTIF(C7:C${last},"Confirmed")`, report.summary.confirmed, 84),
      formulaCell("C5", `COUNTIF(C7:C${last},"Pending Payment")`, report.summary.pending, 84),
      formulaCell("D5", `COUNTIF(C7:C${last},"Cancelled")`, report.summary.cancelled, 84),
      formulaCell("E5", `SUM(E7:E${last})`, report.summary.guests, 91),
      formulaCell("F5", `SUM(F7:F${last})`, report.summary.grossValue, 85),
      formulaCell("G5", `SUM(G7:G${last})`, report.payments.successfulApplied, 85),
      formulaCell("H5", `SUM(H7:H${last})`, report.summary.outstanding, 85),
    ]),
    row(
      6,
      [
        "Created (SAST)",
        "Booking Reference",
        "Booking Status",
        "Payment Status",
        "Pax",
        "Gross Value",
        "Amount Paid",
        "Outstanding",
        "Location",
        "Seating Zone",
        "Performance Date",
        "Performance Time",
        "Customer Cohort",
        "Complete Contact",
      ].map((label, index) =>
        stringCell(
          `${String.fromCharCode(65 + index)}6`,
          label,
          index >= 4 && index <= 7 ? (index === 4 ? 92 : 90) : 59,
        ),
      ),
      { height: 26 },
    ),
  ];
  report.bookingRows.forEach((booking, index) => {
    const rowNumber = index + 7;
    rows.push(
      row(rowNumber, [
        stringCell(`A${rowNumber}`, booking.createdAt),
        stringCell(`B${rowNumber}`, booking.bookingReference),
        stringCell(`C${rowNumber}`, booking.bookingStatus),
        stringCell(`D${rowNumber}`, booking.paymentStatus),
        numberCell(`E${rowNumber}`, booking.pax, 93),
        numberCell(`F${rowNumber}`, booking.grossValue, 95),
        numberCell(`G${rowNumber}`, booking.amountPaid, 95),
        numberCell(`H${rowNumber}`, booking.outstanding, 95),
        stringCell(`I${rowNumber}`, booking.location),
        stringCell(`J${rowNumber}`, booking.seatingZone),
        numberCell(`K${rowNumber}`, excelDate(booking.performanceDate), 86),
        stringCell(`L${rowNumber}`, booking.performanceTime),
        stringCell(`M${rowNumber}`, booking.customerCohort),
        stringCell(`N${rowNumber}`, booking.completeContact),
      ]),
    );
  });
  return { last, rows };
}

function buildPaymentRows(report: DailyAnalyticsReport) {
  const last = Math.max(12, report.paymentRows.length + 11);
  const rows = [
    row(1, [stringCell("A1", `DAY ${report.dayNumber} PAYMENTS`, 3)], {
      height: 32,
    }),
    row(
      2,
      [
        stringCell(
          "A2",
          "Booking-applied values and provider gross | Consumer card/wallet subtype is not stored",
          6,
        ),
      ],
      { height: 24 },
    ),
    row(
      4,
      ["Successful", "Applied", "Average", "Largest", "Full Payments", "Deposits", "Pending Attempts", "Refunds"].map(
        (label, index) => stringCell(`${String.fromCharCode(65 + index)}4`, label, 59),
      ),
      { height: 26 },
    ),
    row(5, [
      formulaCell("A5", `COUNTIF(D12:D${last},"Fully Paid")+COUNTIF(D12:D${last},"Deposit Paid")`, report.payments.successfulPayments, 84),
      formulaCell("B5", `SUMIF(D12:D${last},"Fully Paid",E12:E${last})+SUMIF(D12:D${last},"Deposit Paid",E12:E${last})`, report.payments.successfulApplied, 85),
      formulaCell("C5", "IFERROR(B5/A5,0)", report.payments.averageSuccessfulPayment, 85),
      formulaCell(
        "D5",
        `MAXIFS(E12:E${last},C12:C${last},"Full Payment",D12:D${last},"Fully Paid")`,
        report.payments.largestSuccessfulPayment,
        85,
      ),
      formulaCell("E5", `COUNTIFS(C12:C${last},"Full Payment",D12:D${last},"Fully Paid")`, report.payments.fullPayments, 84),
      formulaCell("F5", `COUNTIFS(C12:C${last},"Deposit",D12:D${last},"Deposit Paid")`, report.payments.depositPayments, 84),
      formulaCell("G5", `COUNTIF(D12:D${last},"Pending Payment")`, report.payments.pendingAttempts, 84),
      formulaCell("H5", `COUNTIF(D12:D${last},"Refunded")`, report.payments.refunds, 84),
    ]),
    row(7, [
      stringCell("A7", "Successful full-payment value", 77),
      numberCell("B7", report.payments.fullPaymentValue, 87),
      stringCell("C7", "Successful deposit value", 87),
      numberCell("D7", report.payments.depositValue, 87),
      stringCell("E7", "Transaction fees", 77),
      numberCell("F7", report.payments.transactionFees, 87),
      stringCell("G7", "Provider gross", 87),
      numberCell("H7", report.payments.providerGross, 87),
    ]),
    row(8, [
      stringCell("A8", "Payment timing", 77),
      stringCell(
        "B8",
        `${report.payments.paymentsReceivedOnReportDate} received today; ${report.payments.olderBookingPaymentsReceived} belonged to older bookings (${formatMoney(report.payments.olderBookingPaymentsReceivedValue)})`,
        77,
      ),
    ]),
    row(
      11,
      [
        "Created (SAST)",
        "Booking Reference",
        "Payment Type",
        "Payment Status",
        "Booking-Applied Amount",
        "Transaction Fee",
        "Provider Gross",
        "Stored Method",
      ].map((label, index) =>
        stringCell(`${String.fromCharCode(65 + index)}11`, label, 59),
      ),
      { height: 26 },
    ),
  ];
  report.paymentRows.forEach((payment, index) => {
    const rowNumber = index + 12;
    rows.push(
      row(rowNumber, [
        stringCell(`A${rowNumber}`, payment.createdAt),
        stringCell(`B${rowNumber}`, payment.bookingReference),
        stringCell(`C${rowNumber}`, payment.paymentType),
        stringCell(`D${rowNumber}`, payment.paymentStatus),
        numberCell(`E${rowNumber}`, payment.appliedAmount, 95),
        numberCell(`F${rowNumber}`, payment.transactionFee, 95),
        numberCell(`G${rowNumber}`, payment.providerGross, 95),
        stringCell(`H${rowNumber}`, payment.storedMethod),
      ]),
    );
  });
  return { last, rows };
}

function buildSeatingRows(report: DailyAnalyticsReport, lastBookingRow: number) {
  const rows = [
    row(1, [stringCell("A1", "SEATING PERFORMANCE", 3)], { height: 32 }),
    row(
      2,
      [
        stringCell(
          "A2",
          `Genuine Day ${report.dayNumber} booking demand and value by configured seating zone`,
          6,
        ),
      ],
      { height: 24 },
    ),
    row(
      5,
      [
        "Seating Zone",
        "Bookings",
        "Pax",
        "Gross Value",
        "Amount Paid",
        "Outstanding",
        "Booking Share",
      ].map((label, index) =>
        stringCell(`${String.fromCharCode(65 + index)}5`, label, 59),
      ),
      { height: 26 },
    ),
  ];
  report.seatingRows.forEach((seating, index) => {
    const rowNumber = index + 6;
    rows.push(
      row(rowNumber, [
        stringCell(`A${rowNumber}`, seating.zone),
        formulaCell(
          `B${rowNumber}`,
          `COUNTIF('BOOKINGS'!$J$7:$J$${lastBookingRow},A${rowNumber})`,
          seating.bookings,
          93,
        ),
        formulaCell(
          `C${rowNumber}`,
          `SUMIF('BOOKINGS'!$J$7:$J$${lastBookingRow},A${rowNumber},'BOOKINGS'!$E$7:$E$${lastBookingRow})`,
          seating.pax,
          93,
        ),
        formulaCell(
          `D${rowNumber}`,
          `SUMIF('BOOKINGS'!$J$7:$J$${lastBookingRow},A${rowNumber},'BOOKINGS'!$F$7:$F$${lastBookingRow})`,
          seating.grossValue,
          60,
        ),
        formulaCell(
          `E${rowNumber}`,
          `SUMIF('BOOKINGS'!$J$7:$J$${lastBookingRow},A${rowNumber},'BOOKINGS'!$G$7:$G$${lastBookingRow})`,
          seating.amountPaid,
          60,
        ),
        formulaCell(
          `F${rowNumber}`,
          `SUMIF('BOOKINGS'!$J$7:$J$${lastBookingRow},A${rowNumber},'BOOKINGS'!$H$7:$H$${lastBookingRow})`,
          seating.outstanding,
          60,
        ),
        formulaCell(
          `G${rowNumber}`,
          `IFERROR(B${rowNumber}/SUM($B$6:$B$9),0)`,
          seating.bookingShare,
          88,
        ),
      ]),
    );
  });
  return rows;
}

function buildShowRows(report: DailyAnalyticsReport) {
  const last = Math.max(9, report.showRows.length + 8);
  const mostBooked = bestShow(report.showRows, (show) => show.bookings);
  const highestPax = bestShow(report.showRows, (show) => show.pax);
  const highestValue = bestShow(report.showRows, (show) => show.grossValue);
  const furthest = [...report.showRows].sort((left, right) =>
    right.performanceDate.localeCompare(left.performanceDate),
  )[0];
  const topShows = [...report.showRows]
    .sort(
      (left, right) =>
        right.grossValue - left.grossValue ||
        left.performanceDate.localeCompare(right.performanceDate),
    )
    .slice(0, 10);
  const rowsByNumber = new Map<number, string[]>();
  const add = (rowNumber: number, cell: string) => {
    const cells = rowsByNumber.get(rowNumber) ?? [];
    cells.push(cell);
    rowsByNumber.set(rowNumber, cells);
  };
  add(1, stringCell("A1", "PERFORMANCE DEMAND", 3));
  add(
    2,
    stringCell(
      "A2",
      `${report.showRows.length} distinct performances booked${furthest ? ` | Furthest-ahead booking: ${formatDate(furthest.performanceDate)}` : ""}`,
      6,
    ),
  );
  add(2, stringCell("K2", "Performance", 59));
  add(2, stringCell("L2", "Gross Value", 59));
  for (const [index, show] of topShows.entries()) {
    const rowNumber = index + 3;
    add(
      rowNumber,
      stringCell(
        `K${rowNumber}`,
        `${show.performanceDate.slice(5)} | ${show.location}`,
      ),
    );
    add(rowNumber, numberCell(`L${rowNumber}`, show.grossValue, 60));
  }
  [
    ["A4", "Most-booked performance"],
    ["B4", "Bookings"],
    ["C4", "Highest-pax performance"],
    ["D4", "Pax"],
    ["E4", "Highest-value performance"],
    ["F4", "Gross Value"],
  ].forEach(([reference, label]) => add(4, stringCell(reference, label, 59)));
  add(5, stringCell("A5", mostBooked ? showLabel(mostBooked) : "No activity", 89));
  add(5, numberCell("B5", mostBooked?.bookings ?? 0, 89));
  add(5, stringCell("C5", highestPax ? showLabel(highestPax) : "No activity", 89));
  add(5, numberCell("D5", highestPax?.pax ?? 0, 89));
  add(5, stringCell("E5", highestValue ? showLabel(highestValue) : "No activity", 89));
  add(5, numberCell("F5", highestValue?.grossValue ?? 0, 61));
  [
    "Performance Date",
    "Time",
    "Location",
    "Performance",
    "Bookings",
    "Pax",
    "Gross Value",
    "Amount Paid",
    "Outstanding",
  ].forEach((label, index) =>
    add(8, stringCell(`${String.fromCharCode(65 + index)}8`, label, 59)),
  );
  report.showRows.forEach((show, index) => {
    const rowNumber = index + 9;
    add(rowNumber, numberCell(`A${rowNumber}`, excelDate(show.performanceDate), 86));
    add(rowNumber, stringCell(`B${rowNumber}`, show.performanceTime));
    add(rowNumber, stringCell(`C${rowNumber}`, show.location));
    add(rowNumber, stringCell(`D${rowNumber}`, show.performanceName));
    add(rowNumber, numberCell(`E${rowNumber}`, show.bookings, 93));
    add(rowNumber, numberCell(`F${rowNumber}`, show.pax, 93));
    add(rowNumber, numberCell(`G${rowNumber}`, show.grossValue, 95));
    add(rowNumber, numberCell(`H${rowNumber}`, show.amountPaid, 95));
    add(rowNumber, numberCell(`I${rowNumber}`, show.outstanding, 95));
  });
  return {
    last,
    rows: Array.from(rowsByNumber.entries())
      .sort(([left], [right]) => left - right)
      .map(([rowNumber, cells]) =>
        row(rowNumber, cells, rowNumber === 1 ? { height: 32 } : {}),
      ),
  };
}

async function replaceFile(
  zip: JSZip,
  filePath: string,
  transform: (source: string) => string,
) {
  const file = zip.file(filePath);
  if (!file) throw new Error(`Daily Analytics template is missing ${filePath}.`);
  zip.file(filePath, transform(await file.async("string")));
}

export async function buildDailyAnalyticsWorkbook(report: DailyAnalyticsReport) {
  const zip = await JSZip.loadAsync(await readFile(templatePath));
  const summary = buildSummaryRows(report);
  const bookings = buildBookingRows(report);
  const payments = buildPaymentRows(report);
  const shows = buildShowRows(report);

  await Promise.all([
    replaceFile(zip, "xl/worksheets/sheet1.xml", (source) =>
      replaceSheetData(source, summary.rows),
    ),
    replaceFile(zip, "xl/worksheets/sheet2.xml", (source) =>
      replaceSheetData(source, bookings.rows),
    ),
    replaceFile(zip, "xl/worksheets/sheet3.xml", (source) =>
      replaceSheetData(source, payments.rows),
    ),
    replaceFile(zip, "xl/worksheets/sheet4.xml", (source) =>
      replaceSheetData(
        source,
        buildSeatingRows(report, summary.lastBookingRow),
      ),
    ),
    replaceFile(zip, "xl/worksheets/sheet5.xml", (source) =>
      replaceSheetData(source, shows.rows),
    ),
    replaceFile(zip, "xl/tables/table1.xml", (source) =>
      source.replace(/ ref="[^"]+"/, ` ref="A6:N${Math.max(6, bookings.last)}"`),
    ),
    replaceFile(zip, "xl/tables/table2.xml", (source) =>
      source.replace(/ ref="[^"]+"/, ` ref="A11:H${Math.max(11, payments.last)}"`),
    ),
    replaceFile(zip, "xl/tables/table4.xml", (source) =>
      source.replace(/ ref="[^"]+"/, ` ref="A8:I${Math.max(8, shows.last)}"`),
    ),
    replaceFile(zip, "xl/drawings/charts/chart3.xml", (source) =>
      source.replace(
        /Top 10 Performances by Daily Value/g,
        `Top 10 Performances by Day ${report.dayNumber} Value`,
      ),
    ),
  ]);

  return zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    type: "nodebuffer",
  });
}
