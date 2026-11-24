import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync(new URL("../app/admin/CustomerManagementWorkspace.tsx", import.meta.url), "utf8");

test("export range reuses branded date pickers rather than native date inputs", () => {
  assert.match(ui, /import ZingaraDatePicker from "\.\/ZingaraDatePicker"/);
  assert.match(ui, /<ZingaraDatePicker label="Export performance from"/);
  assert.match(ui, /<ZingaraDatePicker label="Export performance to"/);
  assert.doesNotMatch(ui, /type="date"/);
});

test("selection controls precede the list and column controls use gold/pill feedback", () => {
  assert.ok(ui.indexOf('aria-label="Customer export selection"') < ui.indexOf('{rows.map((customer)'));
  for (const label of ["Select This Page", "Select All Columns", "Clear Columns"]) assert.ok(ui.includes(label));
  assert.doesNotMatch(ui, /Select visible/i);
  assert.match(ui, /accent-\[#D8C36A\]/);
  assert.match(ui, /enabled:active:bg-\[#D8C36A\]\/20/);
  assert.match(ui, /className=\{customerActionClass\}>Previous/);
  assert.match(ui, /className=\{customerActionClass\}>Next/);
});

test("All Matching and disabled download conditions retain their existing contract", () => {
  assert.match(ui, /selectedIds: exportSelected \? exportIds : null/);
  assert.ok(ui.includes('disabled={exporting || !exportFields.length || (exportSelected && !exportIds.length)}'));
  assert.ok(ui.includes('disabled:opacity-40 enabled:transition-colors'));
  assert.match(ui, /aria-busy=\{exporting\}/);
});

test("permanent doctrine mandates existing branded design system reuse", () => {
  const agents = readFileSync(new URL("../../AGENTS.md", import.meta.url), "utf8");
  assert.match(agents, /Every UI change MUST reuse Zingara's existing design system/);
  assert.match(agents, /generic browser styling or duplicate components/);
});
