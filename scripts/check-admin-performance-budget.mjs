import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const manifestPath = path.join(
  ".next",
  "server",
  "app",
  "admin",
  "page_client-reference-manifest.js",
);
const routeKey = "[project]/src/app/admin/page";
const budgets = {
  gzipBytes: 320_000,
  largestChunkGzipBytes: 170_000,
  rawBytes: 1_320_000,
};

function readAdminEntryChunks() {
  let source;
  try {
    source = readFileSync(manifestPath, "utf8");
  } catch {
    throw new Error(
      `Admin build manifest not found at ${manifestPath}. Run npm run build first.`,
    );
  }

  const assignment = 'globalThis.__RSC_MANIFEST["/admin/page"] = ';
  const start = source.indexOf(assignment);
  const end = source.lastIndexOf(";");
  if (start < 0 || end < start) {
    throw new Error("The Admin client-reference manifest has an unsupported format.");
  }

  const manifest = JSON.parse(source.slice(start + assignment.length, end));
  const chunks = manifest.entryJSFiles?.[routeKey];
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("The Admin route does not expose any initial client chunks.");
  }

  return [...new Set(chunks)];
}

function measureChunks(chunks) {
  return chunks.map((chunk) => {
    const contents = readFileSync(path.join(".next", chunk));
    return {
      chunk,
      gzipBytes: gzipSync(contents).length,
      rawBytes: contents.length,
    };
  });
}

try {
  const measurements = measureChunks(readAdminEntryChunks());
  const rawBytes = measurements.reduce((total, item) => total + item.rawBytes, 0);
  const gzipBytes = measurements.reduce(
    (total, item) => total + item.gzipBytes,
    0,
  );
  const largestChunkGzipBytes = Math.max(
    ...measurements.map((item) => item.gzipBytes),
  );
  const results = { gzipBytes, largestChunkGzipBytes, rawBytes };
  const failures = Object.entries(budgets).filter(
    ([metric, limit]) => results[metric] > limit,
  );

  console.log("Admin initial-route performance budget");
  console.log(`  raw: ${rawBytes.toLocaleString()} / ${budgets.rawBytes.toLocaleString()} bytes`);
  console.log(`  gzip: ${gzipBytes.toLocaleString()} / ${budgets.gzipBytes.toLocaleString()} bytes`);
  console.log(
    `  largest gzip chunk: ${largestChunkGzipBytes.toLocaleString()} / ${budgets.largestChunkGzipBytes.toLocaleString()} bytes`,
  );

  if (failures.length > 0) {
    for (const [metric, limit] of failures) {
      console.error(
        `Performance budget exceeded: ${metric} is ${results[metric].toLocaleString()} bytes (limit ${limit.toLocaleString()}).`,
      );
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
