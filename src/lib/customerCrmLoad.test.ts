import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminPageUrl = new URL("../app/admin/page.tsx", import.meta.url);
const apiClientUrl = new URL("./supabase/apiClient.ts", import.meta.url);
const customerRouteUrl = new URL(
  "../app/api/admin/customers/route.ts",
  import.meta.url,
);

test("Customer CRM loader forwards the active Supabase session", async () => {
  const source = await readFile(adminPageUrl, "utf8");
  const loader = source.match(
    /async function loadLiveCustomerRecords\(\) \{[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(loader);
  assert.match(loader, /fetchSupabaseApi/);
  assert.match(loader, /"\/api\/admin\/customers"/);
  assert.doesNotMatch(loader, /\bfetch\(/);
});

test("authenticated API client sends the Supabase bearer token", async () => {
  const source = await readFile(apiClientUrl, "utf8");

  assert.match(source, /supabase\.auth\.getSession\(\)/);
  assert.match(source, /headers\.Authorization = `Bearer \$\{accessToken\}`/);
});

test("Customer CRM route remains restricted to active staff", async () => {
  const source = await readFile(customerRouteUrl, "utf8");
  const getHandler = source.match(
    /export async function GET\(request: Request\) \{[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(getHandler);
  assert.match(getHandler, /requireActiveStaff\(request\)/);
  assert.match(getHandler, /fetchAllCustomers\(auth\.serviceClient\)/);
});

test("Customer CRM retry still reissues the loader", async () => {
  const source = await readFile(adminPageUrl, "utf8");

  assert.match(source, /async function refreshLiveCustomerRecords\(\)/);
  assert.match(source, /const records = await loadLiveCustomerRecords\(\)/);
  assert.match(source, /onClick=\{\(\) => void refreshLiveCustomerRecords\(\)\}/);
});
