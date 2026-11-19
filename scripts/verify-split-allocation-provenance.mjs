import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Opt-in linked-database QA only: synthetic fixtures and candidate DDL roll back.
const mode = process.argv[2];
if (!["--original", "--candidate", "--deployed"].includes(mode)) {
  throw new Error("Choose --original, --candidate or --deployed (all rollback-only).");
}
const migration = readFileSync(new URL(
  "../supabase/migrations/20261119090000_p0_split_allocation_provenance.sql", import.meta.url,
), "utf8");
const verification = readFileSync(new URL("./verify-split-allocation-provenance.sql", import.meta.url), "utf8");
const sql = `begin;
set local statement_timeout = '15s';
set local lock_timeout = '1s';
select set_config('zingara.qa_expect_original', '${mode === "--original"}', true);
${mode === "--candidate" ? migration : ""}
${verification}
rollback;`;
const result = spawnSync("supabase", ["db", "query", "--linked", "--output", "json", sql], {
  encoding: "utf8", timeout: 45000, maxBuffer: 1024 * 1024,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
