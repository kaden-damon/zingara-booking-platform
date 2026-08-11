import QRCode from "qrcode";
import type {
  DemoBooking,
  DemoShow,
  DemoVenueSettings,
  GuestTicket,
} from "./zingaraDemo";
import { resolveGuestVisibleTable } from "./guestTicketDisplay";
import { normalizeShowLocation } from "./zingaraDemo";

export const ticketPdfPage = {
  height: 601.5,
  width: 283.5,
};

const ticketCanvas = {
  height: 2291,
  width: 1080,
};

const capeTownCardUrl = "/brand/tickets/cape-town-card.png";
const joburgCardUrl = "/brand/tickets/joburg-card.png";
const zingaraStampUrl = "/brand/tickets/zingara-stamp.png";

export type TicketPdfLocation = "cape-town" | "johannesburg";

export type DownloadableTicketPdfInput = {
  courtName?: string;
  guestName: string;
  location: TicketPdfLocation;
  showDate: string;
  tableSeat: string;
  ticketCode: string;
  ticketIndex: number;
  ticketTotal: number;
  venueName?: string;
  zoneBackground: string;
  zoneBorder: string;
  zoneTitle: string;
};

export type DownloadableTicketPdfSource = {
  booking: DemoBooking;
  show: (DemoShow & { name?: string; venue?: string | null }) | null;
  tableColour: {
    background: string;
    border: string;
    label: string;
  };
  ticket: GuestTicket;
  venueSettings: DemoVenueSettings;
};

export class TicketPdfDataError extends Error {
  missingFields: string[];

  constructor(missingFields: string[]) {
    super(`Ticket PDF is missing required data: ${missingFields.join(", ")}.`);
    this.name = "TicketPdfDataError";
    this.missingFields = missingFields;
  }
}

export function formatTicketDisplayDate(dateValue: string | undefined) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function createImagePdfBlob({
  imageDataUrl,
  imageHeight,
  imageWidth,
  pageHeight,
  pageWidth,
}: {
  imageDataUrl: string;
  imageHeight: number;
  imageWidth: number;
  pageHeight: number;
  pageWidth: number;
}) {
  const encoder = new TextEncoder();
  const imageBytes = dataUrlToBytes(imageDataUrl);
  const chunks: BlobPart[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  function addChunk(bytes: Uint8Array) {
    const chunk = new ArrayBuffer(bytes.byteLength);

    new Uint8Array(chunk).set(bytes);
    chunks.push(chunk);
    byteLength += bytes.length;
  }

  function addString(value: string) {
    addChunk(encoder.encode(value));
  }

  function addObject(id: number, body: () => void) {
    offsets[id] = byteLength;
    addString(`${id} 0 obj\n`);
    body();
    addString("\nendobj\n");
  }

  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;

  addString("%PDF-1.4\n");
  addObject(1, () =>
    addString("<< /Type /Catalog /Pages 2 0 R >>"),
  );
  addObject(2, () =>
    addString("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
  );
  addObject(3, () =>
    addString(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
  );
  addObject(4, () => {
    addString(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    );
    addChunk(imageBytes);
    addString("\nendstream");
  });
  addObject(5, () =>
    addString(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
  );

  const xrefOffset = byteLength;

  addString("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    addString(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  addString(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return new Blob(chunks, { type: "application/pdf" });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawContainImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  const drawWidth = imageRatio > targetRatio ? width : height * imageRatio;
  const drawHeight = imageRatio > targetRatio ? width / imageRatio : height;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const nextRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + nextRadius, y);
  context.lineTo(x + width - nextRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + nextRadius);
  context.lineTo(x + width, y + height - nextRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - nextRadius,
    y + height,
  );
  context.lineTo(x + nextRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - nextRadius);
  context.lineTo(x, y + nextRadius);
  context.quadraticCurveTo(x, y, x + nextRadius, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: CanvasFillStrokeStyles["fillStyle"],
) {
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = fillStyle;
  context.fill();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: CanvasFillStrokeStyles["strokeStyle"],
  lineWidth = 1,
) {
  roundedRect(context, x, y, width, height, radius);
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.stroke();
}

function getUpperText(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeTicketText(value: string | undefined | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function requireTicketText(fieldName: string, value: string) {
  const normalizedValue = getUpperText(value);

  if (!normalizedValue) {
    throw new TicketPdfDataError([fieldName]);
  }

  return normalizedValue;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  {
    family,
    maxSize,
    minSize,
    weight,
  }: {
    family: string;
    maxSize: number;
    minSize: number;
    weight: string;
  },
) {
  let size = maxSize;

  while (size > minSize) {
    context.font = `${weight} ${size}px ${family}`;
    if (context.measureText(text).width <= maxWidth) {
      break;
    }
    size -= 2;
  }

  context.fillText(text, x, y, maxWidth);
}

function getVenueCopy(location: TicketPdfLocation) {
  return location === "johannesburg"
    ? {
        artworkUrl: joburgCardUrl,
        courtName: "THE SPRING COURT",
        venueName: "MELROSE ARCH",
      }
    : {
        artworkUrl: capeTownCardUrl,
        courtName: "THE NIGHT COURT",
        venueName: "CENTURY CITY",
      };
}

function resolveTicketLocation({
  show,
}: Pick<DownloadableTicketPdfSource, "show">) {
  const location = normalizeShowLocation(
    show?.location ?? show?.venue ?? show?.venueName,
  );

  return location === "johannesburg"
    ? {
        courtName: "THE SPRING COURT",
        key: "johannesburg" as const,
        venueName: "MELROSE ARCH",
      }
    : {
        courtName: "THE NIGHT COURT",
        key: "cape-town" as const,
        venueName: "CENTURY CITY",
    };
}

function isFallbackTableValue(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  return (
    normalizedValue === "assigned" ||
    normalizedValue === "internal" ||
    normalizedValue === "table assigned"
  );
}

function collectMissingPdfFields(source: DownloadableTicketPdfSource) {
  const missingFields: string[] = [];
  const matchingTicket = source.booking.guestTickets?.find(
    (ticket) => ticket.ticketCode === source.ticket.ticketCode,
  );
  const guestName = normalizeTicketText(source.ticket.fullName);
  const tableNumber = normalizeTicketText(
    resolveGuestVisibleTable(source.booking, source.ticket),
  );
  const showDate = normalizeTicketText(source.show?.date);
  const ticketCode = normalizeTicketText(source.ticket.ticketCode);
  const zoneTitle = normalizeTicketText(source.booking.zoneTitle);
  const location = normalizeShowLocation(
    source.show?.location ?? source.show?.venue ?? source.show?.venueName,
  );

  if (!matchingTicket) {
    missingFields.push("individual ticket record");
  }
  if (!guestName) {
    missingFields.push("guest name");
  }
  if (tableNumber && isFallbackTableValue(tableNumber)) {
    missingFields.push("table or seat");
  }
  if (!showDate) {
    missingFields.push("show date");
  }
  if (!ticketCode) {
    missingFields.push("ticket code");
  }
  if (!zoneTitle) {
    missingFields.push("seating zone");
  }
  if (!location) {
    missingFields.push("show location");
  }
  if (source.ticket.index < 1 || source.ticket.total < source.ticket.index) {
    missingFields.push("ticket numbering");
  }

  return missingFields;
}

export function resolveDownloadableTicketPdfInput(
  source: DownloadableTicketPdfSource,
): DownloadableTicketPdfInput {
  const missingFields = collectMissingPdfFields(source);

  if (missingFields.length > 0) {
    throw new TicketPdfDataError(missingFields);
  }

  const location = resolveTicketLocation(source);
  const tableNumber = normalizeTicketText(
    resolveGuestVisibleTable(source.booking, source.ticket),
  );

  return {
    courtName: location.courtName,
    guestName: normalizeTicketText(source.ticket.fullName),
    location: location.key,
    showDate: formatTicketDisplayDate(source.show?.date),
    tableSeat: tableNumber ? `Table ${tableNumber}` : "",
    ticketCode: normalizeTicketText(source.ticket.ticketCode),
    ticketIndex: source.ticket.index,
    ticketTotal: source.ticket.total,
    venueName: location.venueName,
    zoneBackground: source.tableColour.background,
    zoneBorder: source.tableColour.border,
    zoneTitle: normalizeTicketText(source.booking.zoneTitle),
  };
}

export async function createDownloadableTicketPdf(
  input: DownloadableTicketPdfInput,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Ticket renderer is unavailable.");
  }

  canvas.width = ticketCanvas.width;
  canvas.height = ticketCanvas.height;

  const venueCopy = getVenueCopy(input.location);
  const guestName = requireTicketText("guest name", input.guestName);
  const tableSeat = input.tableSeat.trim();
  const courtName = requireTicketText(
    "court name",
    input.courtName ?? venueCopy.courtName,
  );
  const venueName = requireTicketText(
    "venue name",
    input.venueName ?? venueCopy.venueName,
  );
  const showDate = requireTicketText("show date", input.showDate);
  const ticketCode = requireTicketText("ticket code", input.ticketCode);
  const zoneTitle = requireTicketText("seating zone", input.zoneTitle);

  if (input.ticketIndex < 1 || input.ticketTotal < input.ticketIndex) {
    throw new Error("Ticket PDF is missing valid ticket numbering.");
  }

  const artwork = await loadImage(venueCopy.artworkUrl);
  const stamp = await loadImage(zingaraStampUrl);
  const qrDataUrl = await QRCode.toDataURL(ticketCode, {
    color: { dark: "#000000", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 10,
    type: "image/png",
    width: 350,
  });
  const qrImage = await loadImage(qrDataUrl);
  const centre = ticketCanvas.width / 2;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, ticketCanvas.width, ticketCanvas.height);

  const body = {
    height: 1986,
    radius: 92,
    width: 906,
    x: 87,
    y: 164,
  };

  fillRoundedRect(
    context,
    body.x,
    body.y,
    body.width,
    body.height,
    body.radius,
    "#000000",
  );
  strokeRoundedRect(
    context,
    body.x,
    body.y,
    body.width,
    body.height,
    body.radius,
    "rgba(216,195,106,0.92)",
    3,
  );

  if (stamp) {
    const stampSize = 255;

    context.drawImage(stamp, centre - stampSize / 2, 42, stampSize, stampSize);
  }

  if (artwork) {
    drawContainImage(context, artwork, 216, 350, 648, 432);
  }

  const zoneGradient = context.createLinearGradient(126, 875, 954, 1034);
  zoneGradient.addColorStop(0, "rgba(0,0,0,0.92)");
  zoneGradient.addColorStop(0.48, input.zoneBackground);
  zoneGradient.addColorStop(1, "rgba(0,0,0,0.92)");
  fillRoundedRect(context, 126, 868, 828, 162, 20, zoneGradient);
  strokeRoundedRect(
    context,
    126,
    868,
    828,
    162,
    20,
    input.zoneBorder,
    2.5,
  );

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#FFFFFF";
  fitText(context, zoneTitle, centre, 949, 760, {
    family: "Georgia, 'Times New Roman', serif",
    maxSize: 58,
    minSize: 34,
    weight: "700",
  });

  const sansFont = "Arial, Helvetica, sans-serif";

  context.fillStyle = "#FFFFFF";
  fitText(context, guestName, centre, 1136, 680, {
    family: sansFont,
    maxSize: 48,
    minSize: 28,
    weight: "400",
  });
  if (tableSeat) {
    context.fillStyle = "#D8C36A";
    fitText(context, tableSeat, centre, 1220, 680, {
      family: sansFont,
      maxSize: 45,
      minSize: 28,
      weight: "700",
    });
  }
  context.fillStyle = "#FFFFFF";
  fitText(context, courtName, centre, 1316, 720, {
    family: sansFont,
    maxSize: 44,
    minSize: 28,
    weight: "400",
  });
  fitText(context, venueName, centre, 1408, 720, {
    family: sansFont,
    maxSize: 42,
    minSize: 28,
    weight: "400",
  });
  fitText(context, showDate, centre, 1502, 720, {
    family: sansFont,
    maxSize: 43,
    minSize: 28,
    weight: "400",
  });

  fillRoundedRect(context, 317, 1601, 446, 494, 62, "#000000");
  strokeRoundedRect(
    context,
    317,
    1601,
    446,
    494,
    62,
    "rgba(255,255,255,0.82)",
    2.2,
  );

  if (qrImage) {
    context.fillStyle = "#FFFFFF";
    context.fillRect(370, 1668, 340, 340);
    context.drawImage(qrImage, 375, 1673, 330, 330);
  }

  context.fillStyle = "#FFFFFF";
  fitText(context, ticketCode, centre, 2043, 370, {
    family: sansFont,
    maxSize: 41,
    minSize: 25,
    weight: "400",
  });

  context.fillStyle = "#FFFFFF";
  fitText(
    context,
    `TICKET ${input.ticketIndex} OF ${input.ticketTotal}`,
    centre,
    2128,
    620,
    {
      family: "Georgia, 'Times New Roman', serif",
      maxSize: 42,
      minSize: 28,
      weight: "700",
    },
  );

  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.96);

  return createImagePdfBlob({
    imageDataUrl: jpegDataUrl,
    imageHeight: ticketCanvas.height,
    imageWidth: ticketCanvas.width,
    pageHeight: ticketPdfPage.height,
    pageWidth: ticketPdfPage.width,
  });
}
