import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS, { type Cell, type Row, type Worksheet } from "exceljs";
import {
  deriveCustomerNameParts,
  getCustomerDisplayName,
} from "@/lib/customerNameStatus";

export const tablePlanTemplatePath = path.join(
  process.cwd(),
  "src/templates/Zingara_Table_Plan_Master_Template.xlsx",
);

type TablePlanZoneId =
  | "private-booths"
  | "middle-ring"
  | "golden-circle"
  | "royal-balcony";

export type TablePlanShow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string;
};

export type TablePlanTable = {
  availability_scope: string | null;
  booking_id: string | null;
  capacity: number;
  id: string;
  is_override: boolean;
  merged_from: string[] | null;
  merged_parent_id: string | null;
  override_notes: string | null;
  section: string;
  status: string;
  table_code: string;
};

export type TablePlanBooking = {
  amount_paid: number;
  archived_at: string | null;
  balance_outstanding: number;
  booking_reference: string;
  booking_status: string;
  customer_id: string | null;
  dietary_requirements: string | null;
  guest_count: number;
  id: string;
  notes: string | null;
  payment_status: string;
  section: string;
  table_id: string | null;
  total_amount: number;
};

export type TablePlanCustomer = {
  dietary_requirements: string | null;
  email: string | null;
  first_name: string;
  id: string;
  mobile: string | null;
  relationship_notes: string | null;
  surname: string | null;
};

export type TablePlanPayment = {
  amount: number;
  booking_id: string;
  method: string | null;
  notes: string | null;
  payment_status: string;
  payment_type: string;
};

export type TablePlanExportInput = {
  bookings: TablePlanBooking[];
  customers: TablePlanCustomer[];
  payments: TablePlanPayment[];
  show: TablePlanShow;
  tables: TablePlanTable[];
  templateBuffer?: Buffer;
};

type ZoneLayout = {
  dataRows: number[];
  finalDataRow: number;
  firstDataRow: number;
  subtotalRows: Array<{ end: number; row: number; start: number }>;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";
const activeBookingStatuses = new Set([
  "checked_in",
  "confirmed",
  "new",
  "pending_payment",
]);
const supportedZoneOrder: TablePlanZoneId[] = [
  "private-booths",
  "middle-ring",
  "golden-circle",
  "royal-balcony",
];
const baseZoneSlots: Record<TablePlanZoneId, number> = {
  "private-booths": 23,
  "middle-ring": 28,
  "golden-circle": 23,
  "royal-balcony": 4,
};
const baseInsertRows: Record<TablePlanZoneId, number> = {
  "private-booths": 28,
  "middle-ring": 58,
  "golden-circle": 84,
  "royal-balcony": 89,
};
const dynamicMergeAddresses = [
  "A4:A14",
  "A16:A27",
  "A29:A42",
  "A44:A57",
  "A59:A64",
  "A66:A71",
  "A73:A83",
  "E100:G100",
];

function cloneStyle(cell: Cell) {
  return structuredClone(cell.style);
}

function normalizeZone(section: string): TablePlanZoneId | null {
  const normalized = section
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  if (
    normalized === "private-booths" ||
    normalized === "royal-booths" ||
    normalized === "raised-booths"
  ) {
    return "private-booths";
  }

  if (normalized === "middle-ring") {
    return "middle-ring";
  }

  if (normalized === "golden-circle") {
    return "golden-circle";
  }

  if (normalized === "royal-balcony") {
    return "royal-balcony";
  }

  return null;
}

function compareTableCodes(left: TablePlanTable, right: TablePlanTable) {
  const parse = (value: string) => {
    const match = value.trim().match(/^([^\d]*)(\d+)(.*)$/);

    return match
      ? {
          number: Number(match[2]),
          prefix: match[1].toLowerCase(),
          suffix: match[3].toLowerCase(),
        }
      : { number: Number.MAX_SAFE_INTEGER, prefix: value.toLowerCase(), suffix: "" };
  };
  const leftParts = parse(left.table_code);
  const rightParts = parse(right.table_code);

  return (
    leftParts.prefix.localeCompare(rightParts.prefix) ||
    leftParts.number - rightParts.number ||
    leftParts.suffix.localeCompare(rightParts.suffix) ||
    left.id.localeCompare(right.id)
  );
}

function getCustomerName(customer: TablePlanCustomer | undefined) {
  if (!customer) {
    return "Guest not recorded";
  }

  const parts = deriveCustomerNameParts({
    firstName: customer.first_name,
    lastName: customer.surname,
  });

  return (
    getCustomerDisplayName({
      firstName: parts.firstName,
      lastName: parts.lastName,
    }) || "Guest not recorded"
  );
}

function stripLegacyMetadata(value: string | null | undefined) {
  return (value ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(
      (part) =>
        !/^(legacy dineplan ref|legacy source table|legacy total balance|guest match|legacy import)/i.test(
          part,
        ),
    )
    .join(" | ");
}

function getBookingNotes(booking: TablePlanBooking) {
  if (!booking.notes?.startsWith(bookingMetadataPrefix)) {
    return stripLegacyMetadata(booking.notes);
  }

  try {
    const metadata = JSON.parse(
      booking.notes.slice(bookingMetadataPrefix.length),
    ) as {
      guestNotes?: string;
      operationalNotes?: string;
    };

    return [metadata.guestNotes, metadata.operationalNotes]
      .map(stripLegacyMetadata)
      .filter(Boolean)
      .join(" | ");
  } catch {
    return "";
  }
}

function getOperationalNotes(
  booking: TablePlanBooking,
  customer: TablePlanCustomer | undefined,
) {
  return [
    booking.dietary_requirements,
    customer?.dietary_requirements,
    getBookingNotes(booking),
    stripLegacyMetadata(customer?.relationship_notes),
  ]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" | ");
}

function getPaymentColumn(method: string | null, type: string) {
  const normalizedMethod = (method ?? "").trim().toLowerCase();
  const isCard = ["card", "cc", "credit card", "credit-card"].includes(
    normalizedMethod,
  );
  const isEft = ["eft", "bank transfer", "bank-transfer"].includes(
    normalizedMethod,
  );

  if (!isCard && !isEft) {
    return null;
  }

  if (type === "deposit") {
    return isCard ? 9 : 10;
  }

  if (type === "balance" || type === "full_payment") {
    return isCard ? 8 : 11;
  }

  return null;
}

function copyTableRowStyle(worksheet: Worksheet, sourceRow: Row, targetRow: Row) {
  targetRow.height = sourceRow.height;
  targetRow.hidden = sourceRow.hidden;

  for (let column = 1; column <= 20; column += 1) {
    targetRow.getCell(column).style = cloneStyle(sourceRow.getCell(column));
  }

  targetRow.getCell(20).value = {
    formula: `SUM(Q${targetRow.number}+S${targetRow.number})`,
    result: 0,
  };
}

function insertTableRows(
  worksheet: Worksheet,
  extraRows: Record<TablePlanZoneId, number>,
) {
  for (const zone of [...supportedZoneOrder].reverse()) {
    const count = extraRows[zone];
    const insertAt = baseInsertRows[zone];

    for (let index = 0; index < count; index += 1) {
      const sourceRow = worksheet.getRow(insertAt - 1);
      const insertedRow = worksheet.insertRow(insertAt, [], "n");

      copyTableRowStyle(worksheet, sourceRow, insertedRow);
    }
  }
}

function createZoneLayouts(extraRows: Record<TablePlanZoneId, number>) {
  const privateExtra = extraRows["private-booths"];
  const middleExtra = extraRows["middle-ring"];
  const goldenExtra = extraRows["golden-circle"];
  const privateOffset = privateExtra;
  const middleOffset = privateExtra + middleExtra;
  const goldenOffset = privateExtra + middleExtra + goldenExtra;

  return {
    "private-booths": {
      dataRows: [
        ...range(4, 14),
        ...range(16, 27 + privateExtra),
      ],
      finalDataRow: 27 + privateExtra,
      firstDataRow: 4,
      subtotalRows: [
        { end: 14, row: 15, start: 4 },
        {
          end: 27 + privateExtra,
          row: 28 + privateExtra,
          start: 16,
        },
      ],
    },
    "middle-ring": {
      dataRows: [
        ...range(29 + privateOffset, 42 + privateOffset),
        ...range(
          44 + privateOffset,
          57 + privateOffset + middleExtra,
        ),
      ],
      finalDataRow: 57 + privateOffset + middleExtra,
      firstDataRow: 29 + privateOffset,
      subtotalRows: [
        {
          end: 42 + privateOffset,
          row: 43 + privateOffset,
          start: 29 + privateOffset,
        },
        {
          end: 57 + privateOffset + middleExtra,
          row: 58 + privateOffset + middleExtra,
          start: 44 + privateOffset,
        },
      ],
    },
    "golden-circle": {
      dataRows: [
        ...range(59 + middleOffset, 64 + middleOffset),
        ...range(66 + middleOffset, 71 + middleOffset),
        ...range(73 + middleOffset, 83 + middleOffset + goldenExtra),
      ],
      finalDataRow: 83 + middleOffset + goldenExtra,
      firstDataRow: 59 + middleOffset,
      subtotalRows: [
        {
          end: 64 + middleOffset,
          row: 65 + middleOffset,
          start: 59 + middleOffset,
        },
        {
          end: 71 + middleOffset,
          row: 72 + middleOffset,
          start: 66 + middleOffset,
        },
        {
          end: 83 + middleOffset + goldenExtra,
          row: 84 + middleOffset + goldenExtra,
          start: 73 + middleOffset,
        },
      ],
    },
    "royal-balcony": {
      dataRows: range(
        85 + goldenOffset,
        88 + goldenOffset + extraRows["royal-balcony"],
      ),
      finalDataRow:
        88 + goldenOffset + extraRows["royal-balcony"],
      firstDataRow: 85 + goldenOffset,
      subtotalRows: [
        {
          end: 88 + goldenOffset + extraRows["royal-balcony"],
          row: 89 + goldenOffset + extraRows["royal-balcony"],
          start: 85 + goldenOffset,
        },
      ],
    },
  } satisfies Record<TablePlanZoneId, ZoneLayout>;
}

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) =>
    start + index,
  );
}

function restoreDynamicMerges(
  worksheet: Worksheet,
  layouts: Record<TablePlanZoneId, ZoneLayout>,
  rowOffset: number,
) {
  worksheet.mergeCells("A4:A14");
  worksheet.mergeCells(
    `A16:A${layouts["private-booths"].finalDataRow}`,
  );
  worksheet.mergeCells(
    `A${layouts["middle-ring"].firstDataRow}:A${layouts["middle-ring"].subtotalRows[0].end}`,
  );
  worksheet.mergeCells(
    `A${layouts["middle-ring"].subtotalRows[1].start}:A${layouts["middle-ring"].finalDataRow}`,
  );
  worksheet.mergeCells(
    `A${layouts["golden-circle"].firstDataRow}:A${layouts["golden-circle"].subtotalRows[0].end}`,
  );
  worksheet.mergeCells(
    `A${layouts["golden-circle"].subtotalRows[1].start}:A${layouts["golden-circle"].subtotalRows[1].end}`,
  );
  worksheet.mergeCells(
    `A${layouts["golden-circle"].subtotalRows[2].start}:A${layouts["golden-circle"].finalDataRow}`,
  );
  worksheet.mergeCells(`E${100 + rowOffset}:G${100 + rowOffset}`);
}

function clearTableDataRow(row: Row) {
  for (let column = 2; column <= 19; column += 1) {
    row.getCell(column).value = null;
  }

  row.getCell(20).value = {
    formula: `SUM(Q${row.number}+S${row.number})`,
    result: 0,
  };
}

function setFormula(cell: Cell, formula: string, result = 0) {
  cell.value = { formula, result };
}

function updateTablePlanFormulas(
  worksheet: Worksheet,
  layouts: Record<TablePlanZoneId, ZoneLayout>,
  rowOffset: number,
  totalCapacity: number,
) {
  for (const layout of Object.values(layouts)) {
    for (const subtotal of layout.subtotalRows) {
      setFormula(
        worksheet.getCell(`C${subtotal.row}`),
        `SUM(C${subtotal.start}:C${subtotal.end})`,
      );
    }
  }

  const tableTotalsRow = 90 + rowOffset;
  const finalTableRow = 89 + rowOffset;
  const summaryCapacityRow = 92 + rowOffset;
  const checklistOffset = rowOffset;

  for (const column of ["H", "I", "J", "K", "L", "N", "O", "P", "Q", "R", "S", "T"]) {
    setFormula(
      worksheet.getCell(`${column}${tableTotalsRow}`),
      `SUM(${column}4:${column}${finalTableRow})`,
    );
  }

  worksheet.getCell(`M${tableTotalsRow}`).value = 0;
  worksheet.getCell(`C${summaryCapacityRow}`).value = totalCapacity;
  setFormula(
    worksheet.getCell(`D${summaryCapacityRow}`),
    `SUM(D4:D${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${102 + checklistOffset}`),
    `SUM(D${summaryCapacityRow})`,
  );
  setFormula(
    worksheet.getCell(`G${103 + checklistOffset}`),
    `SUM(H${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${104 + checklistOffset}`),
    `SUM(K${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${105 + checklistOffset}`),
    `SUM(G${103 + checklistOffset}:G${104 + checklistOffset})`,
  );
  setFormula(
    worksheet.getCell(`G${107 + checklistOffset}`),
    `SUM(I${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${108 + checklistOffset}`),
    `SUM(J${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${109 + checklistOffset}`),
    `SUM(G${107 + checklistOffset}:G${108 + checklistOffset})`,
  );
  setFormula(
    worksheet.getCell(`G${111 + checklistOffset}`),
    `SUM(H${layouts["middle-ring"].firstDataRow}:K${layouts["middle-ring"].finalDataRow})`,
  );
  setFormula(
    worksheet.getCell(`G${112 + checklistOffset}`),
    `SUM(H${layouts["private-booths"].firstDataRow}:K${layouts["private-booths"].finalDataRow})`,
  );
  setFormula(
    worksheet.getCell(`G${113 + checklistOffset}`),
    `SUM(H${layouts["golden-circle"].firstDataRow}:K${layouts["golden-circle"].finalDataRow})`,
  );
  setFormula(
    worksheet.getCell(`G${114 + checklistOffset}`),
    `SUM(H${layouts["royal-balcony"].firstDataRow}:K${layouts["royal-balcony"].finalDataRow})`,
  );
  setFormula(
    worksheet.getCell(`G${115 + checklistOffset}`),
    `SUM(G${111 + checklistOffset}:G${114 + checklistOffset})`,
  );
  setFormula(
    worksheet.getCell(`G${118 + checklistOffset}`),
    `SUM(L${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${120 + checklistOffset}`),
    `SUM(G${118 + checklistOffset}:G${119 + checklistOffset})`,
  );
  setFormula(
    worksheet.getCell(`G${122 + checklistOffset}`),
    `SUM(M${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${123 + checklistOffset}`),
    `SUM(N${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${124 + checklistOffset}`),
    `SUM(L${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${125 + checklistOffset}`),
    `SUM(R${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${127 + checklistOffset}`),
    `SUM(S${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${128 + checklistOffset}`),
    `SUM(Q${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${130 + checklistOffset}`),
    `SUM(O${tableTotalsRow})`,
  );
  setFormula(
    worksheet.getCell(`G${131 + checklistOffset}`),
    `SUM(P${tableTotalsRow})`,
  );
}

function populateNotesSheet(
  worksheet: Worksheet,
  entries: Record<TablePlanZoneId, Array<[string, string, string]>>,
) {
  const noteGroups = [
    { baseEnd: 19, baseStart: 16, zone: "golden-circle" as const },
    { baseEnd: 14, baseStart: 9, zone: "middle-ring" as const },
    { baseEnd: 7, baseStart: 3, zone: "private-booths" as const },
  ];
  const extraByZone = Object.fromEntries(
    noteGroups.map(({ baseEnd, baseStart, zone }) => [
      zone,
      Math.max(entries[zone].length - (baseEnd - baseStart + 1), 0),
    ]),
  ) as Record<Exclude<TablePlanZoneId, "royal-balcony">, number>;

  for (const address of ["A2:A7", "A8:A14", "A15:A19"]) {
    worksheet.unMergeCells(address);
  }

  for (const group of noteGroups) {
    const extra = extraByZone[group.zone];
    const insertAt = group.baseEnd + 1;

    for (let index = 0; index < extra; index += 1) {
      const sourceRow = worksheet.getRow(insertAt - 1);
      const insertedRow = worksheet.insertRow(insertAt, [], "n");

      insertedRow.height = sourceRow.height;
      for (let column = 1; column <= 4; column += 1) {
        insertedRow.getCell(column).style = cloneStyle(sourceRow.getCell(column));
      }
    }
  }

  const privateExtra = extraByZone["private-booths"];
  const middleExtra = extraByZone["middle-ring"];
  const privateStart = 3;
  const privateEnd = 7 + privateExtra;
  const middleHeader = 8 + privateExtra;
  const middleStart = 9 + privateExtra;
  const middleEnd = 14 + privateExtra + middleExtra;
  const goldenHeader = 15 + privateExtra + middleExtra;
  const goldenStart = 16 + privateExtra + middleExtra;
  const goldenEnd = 19 + privateExtra + middleExtra + extraByZone["golden-circle"];

  worksheet.mergeCells(`A2:A${privateEnd}`);
  worksheet.mergeCells(`A${middleHeader}:A${middleEnd}`);
  worksheet.mergeCells(`A${goldenHeader}:A${goldenEnd}`);

  const rowsByZone: Record<Exclude<TablePlanZoneId, "royal-balcony">, number[]> = {
    "private-booths": range(privateStart, privateEnd),
    "middle-ring": range(middleStart, middleEnd),
    "golden-circle": range(goldenStart, goldenEnd),
  };

  for (const zone of ["private-booths", "middle-ring", "golden-circle"] as const) {
    rowsByZone[zone].forEach((rowNumber, index) => {
      const row = worksheet.getRow(rowNumber);
      const entry = entries[zone][index];

      row.getCell(2).value = entry?.[0] ?? null;
      row.getCell(3).value = entry?.[1] ?? null;
      row.getCell(4).value = entry?.[2] ?? null;
    });
  }
}

export async function buildTablePlanWorkbook(input: TablePlanExportInput) {
  const templateBuffer =
    input.templateBuffer ?? (await readFile(tablePlanTemplatePath));
  const templateArrayBuffer = templateBuffer.buffer.slice(
    templateBuffer.byteOffset,
    templateBuffer.byteOffset + templateBuffer.byteLength,
  ) as ArrayBuffer;
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(templateArrayBuffer);

  const tablePlan = workbook.getWorksheet("Table Plan");
  const notes = workbook.getWorksheet("Notes");

  if (!tablePlan || !notes) {
    throw new Error("The Table Plan master workbook is missing required sheets.");
  }

  const tablesByZone = Object.fromEntries(
    supportedZoneOrder.map((zone) => [zone, [] as TablePlanTable[]]),
  ) as Record<TablePlanZoneId, TablePlanTable[]>;

  for (const table of input.tables) {
    if (table.merged_parent_id) {
      continue;
    }

    const zone = normalizeZone(table.section);

    if (!zone) {
      if (table.status !== "disabled") {
        throw new Error(
          `Table ${table.table_code} uses unsupported section ${table.section}.`,
        );
      }
      continue;
    }

    tablesByZone[zone].push(table);
  }

  for (const zone of supportedZoneOrder) {
    tablesByZone[zone].sort(compareTableCodes);
  }

  const extraRows = Object.fromEntries(
    supportedZoneOrder.map((zone) => [
      zone,
      Math.max(tablesByZone[zone].length - baseZoneSlots[zone], 0),
    ]),
  ) as Record<TablePlanZoneId, number>;
  const rowOffset = Object.values(extraRows).reduce(
    (total, count) => total + count,
    0,
  );

  for (const address of dynamicMergeAddresses) {
    tablePlan.unMergeCells(address);
  }

  insertTableRows(tablePlan, extraRows);
  const layouts = createZoneLayouts(extraRows);
  restoreDynamicMerges(tablePlan, layouts, rowOffset);

  const customersById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const paymentsByBookingId = new Map<string, TablePlanPayment[]>();

  for (const payment of input.payments) {
    paymentsByBookingId.set(payment.booking_id, [
      ...(paymentsByBookingId.get(payment.booking_id) ?? []),
      payment,
    ]);
  }

  const activeBookings = input.bookings.filter(
    (booking) =>
      !booking.archived_at && activeBookingStatuses.has(booking.booking_status),
  );
  const bookingsByTableId = new Map<string, TablePlanBooking[]>();

  for (const booking of activeBookings) {
    if (!booking.table_id) {
      continue;
    }

    bookingsByTableId.set(booking.table_id, [
      ...(bookingsByTableId.get(booking.table_id) ?? []),
      booking,
    ]);
  }

  const notesEntries = Object.fromEntries(
    supportedZoneOrder.map((zone) => [
      zone,
      [] as Array<[string, string, string]>,
    ]),
  ) as Record<TablePlanZoneId, Array<[string, string, string]>>;

  for (const zone of supportedZoneOrder) {
    const layout = layouts[zone];

    layout.dataRows.forEach((rowNumber, index) => {
      const row = tablePlan.getRow(rowNumber);
      const table = tablesByZone[zone][index];

      clearTableDataRow(row);

      if (!table) {
        return;
      }

      row.getCell(2).value = table.table_code;
      row.getCell(3).value = Math.max(Number(table.capacity) || 0, 0);

      if (table.status === "disabled") {
        row.getCell(7).value = ["DISABLED", table.override_notes?.trim()]
          .filter(Boolean)
          .join(" · ");
        return;
      }

      const candidates = bookingsByTableId.get(table.id) ?? [];

      if (candidates.length > 1) {
        throw new Error(
          `Table ${table.table_code} has multiple active booking assignments.`,
        );
      }

      const booking = candidates[0];

      if (!booking) {
        return;
      }

      if (table.booking_id && table.booking_id !== booking.id) {
        throw new Error(
          `Table ${table.table_code} has conflicting booking assignment data.`,
        );
      }

      const customer = booking.customer_id
        ? customersById.get(booking.customer_id)
        : undefined;
      const customerName = getCustomerName(customer);
      const operationalNotes = getOperationalNotes(booking, customer);
      const referenceAndContact = [
        booking.booking_reference,
        customer?.email?.trim(),
        operationalNotes,
      ]
        .filter(Boolean)
        .join(" · ");

      row.getCell(4).value = Math.max(Number(booking.guest_count) || 0, 0);
      row.getCell(5).value = customerName;
      row.getCell(6).value = customer?.mobile?.trim() || null;
      row.getCell(7).value = referenceAndContact || booking.booking_reference;
      row.getCell(12).value = Math.max(
        Number(booking.balance_outstanding) || 0,
        0,
      );

      if (booking.payment_status === "comp_vip") {
        row.getCell(14).value = Math.max(Number(booking.total_amount) || 0, 0);
      }

      for (const payment of paymentsByBookingId.get(booking.id) ?? []) {
        if (
          !["deposit_paid", "fully_paid"].includes(payment.payment_status) ||
          Number(payment.amount) <= 0
        ) {
          continue;
        }

        const paymentColumn = getPaymentColumn(
          payment.method,
          payment.payment_type,
        );

        if (paymentColumn) {
          const current = Number(row.getCell(paymentColumn).value) || 0;
          row.getCell(paymentColumn).value = current + Number(payment.amount);
        }
      }

      if (operationalNotes) {
        notesEntries[zone].push([
          table.table_code,
          customerName,
          operationalNotes,
        ]);
      }
    });
  }

  const totalCapacity = supportedZoneOrder.reduce(
    (total, zone) =>
      total +
      tablesByZone[zone].reduce(
        (zoneTotal, table) => zoneTotal + Math.max(Number(table.capacity) || 0, 0),
        0,
      ),
    0,
  );

  updateTablePlanFormulas(tablePlan, layouts, rowOffset, totalCapacity);
  populateNotesSheet(notes, notesEntries);

  const location = input.show.venue === "johannesburg" ? "JHB" : "CPT";
  tablePlan.getCell("E2").value = `${location} · ${input.show.date} · ${input.show.time.slice(0, 5)}`;

  workbook.calcProperties.fullCalcOnLoad = true;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
