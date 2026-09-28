export type ZingaraPdfSection = {
  rows: Array<{ label?: string; value: string }>;
  title: string;
};

export function createPdfBytesFromPageContent(input: {
  height: number;
  pages: string[];
  width: number;
}) {
  const encoder = new TextEncoder();
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageRefs: string[] = [];
  input.pages.forEach((content) => {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageRefs.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${input.width} ${input.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${input.pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(pdf);
}

function escapePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrapText(value: string, maxLength: number) {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if (`${line} ${word}`.length <= maxLength) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    lines.push(line || "-");
  }
  return lines;
}

export function createZingaraTextPdf(input: {
  footer?: string;
  sections: ZingaraPdfSection[];
  subtitle: string;
  title: string;
}) {
  const width = 595;
  const height = 842;
  const margin = 42;
  const pageBackground = `1 1 1 rg 0 0 ${width} ${height} re f\n`;
  const pages: string[] = [pageBackground];
  let y = height - margin;

  function command(value: string) { pages[pages.length - 1] += value; }
  function addPage() { pages.push(pageBackground); y = height - margin; }
  function ensureSpace(points: number) { if (y - points < 52) addPage(); }
  function text(value: string, x: number, size = 9, bold = false, color = "0.12 0.12 0.12") {
    command(`${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET\n`);
  }
  function rule() { command(`0.73 0.60 0.18 RG 0.8 w ${margin} ${y} m ${width - margin} ${y} l S\n`); }

  text("ZINGARA", margin, 11, true, "0.73 0.60 0.18");
  y -= 25;
  text(input.title, margin, 19, true);
  y -= 18;
  for (const line of wrapText(input.subtitle, 85)) { text(line, margin, 9, false, "0.35 0.35 0.35"); y -= 12; }
  y -= 4;
  rule();
  y -= 20;

  for (const section of input.sections) {
    ensureSpace(55);
    text(section.title.toUpperCase(), margin, 10, true, "0.60 0.48 0.12");
    y -= 17;
    for (const row of section.rows) {
      const prefix = row.label ? `${row.label}: ` : "";
      const lines = wrapText(`${prefix}${row.value || "-"}`, 92);
      ensureSpace(lines.length * 13 + 4);
      for (const line of lines) { text(line, margin + 8, 9); y -= 13; }
      y -= 2;
    }
    y -= 9;
  }

  const footer = input.footer ?? "Generated from the live Zingara Corporate booking record.";
  pages.forEach((_, index) => {
    pages[index] += `0.45 0.45 0.45 rg BT /F1 7 Tf ${margin} 28 Td (${escapePdfText(footer)}) Tj ET\n`;
    pages[index] += `BT /F1 7 Tf ${width - 92} 28 Td (Page ${index + 1} of ${pages.length}) Tj ET\n`;
  });

  return createPdfBytesFromPageContent({ height, pages, width });
}
