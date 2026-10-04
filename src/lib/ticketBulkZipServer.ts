import JSZip from "jszip";

import type { DownloadableTicketPdfInput } from "./ticketPdf";
import { createServerDownloadableTicketPdf } from "./ticketPdfServer";
import { getIndividualTicketPdfFilename } from "./ticketBulkDownload";

export type BulkTicketPdfEntry = {
  input: DownloadableTicketPdfInput;
  issuedAt: string | null;
  ticketCode: string;
};

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < values.length) {
      const index = nextIndex;

      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => runWorker(),
    ),
  );
  return results;
}

export async function createAllTicketsZip(entries: BulkTicketPdfEntry[]) {
  const rendered = await mapWithConcurrency(entries, 4, async (entry) => ({
    bytes: await createServerDownloadableTicketPdf(entry.input),
    entry,
  }));
  const zip = new JSZip();

  for (const { bytes, entry } of rendered) {
    zip.file(getIndividualTicketPdfFilename(entry.ticketCode), bytes, {
      binary: true,
      compression: "STORE",
      date: entry.issuedAt ? new Date(entry.issuedAt) : new Date(0),
    });
  }

  return zip.generateAsync({
    compression: "STORE",
    type: "uint8array",
  });
}
