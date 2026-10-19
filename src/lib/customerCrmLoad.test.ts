import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const customerWorkspaceUrl = new URL(
  "../app/admin/CustomerManagementWorkspace.tsx",
  import.meta.url,
);
const apiClientUrl = new URL("./supabase/apiClient.ts", import.meta.url);
const customerRouteUrl = new URL(
  "../app/api/admin/customers/route.ts",
  import.meta.url,
);

test("Customer CRM loader forwards the active Supabase session", async () => {
  const source = await readFile(customerWorkspaceUrl, "utf8");
  assert.match(source, /fetchSupabaseApi/);
  assert.match(source, /\/api\/admin\/customer-management/);
  assert.doesNotMatch(source, /\bfetch\(/);
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

test("Customer CRM retry still reissues the bounded loader", async () => {
  const source = await readFile(customerWorkspaceUrl, "utf8");
  assert.match(source, /const loadList = useCallback/);
  assert.match(source, /Customers couldn't be loaded\. Try again\./);
  assert.match(source, /void loadList\(\)/);
});

test("Customer booking history remains available from exact customer details", async () => {
  const source = await readFile(customerWorkspaceUrl, "utf8");
  assert.match(source, /mode=detail&id=/);
  assert.match(source, /detail\.bookings\.map/);
  assert.match(source, /booking\.booking_reference/);
});
