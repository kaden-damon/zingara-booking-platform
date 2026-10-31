import assert from "node:assert/strict";
import test from "node:test";

import { buildWaitlistPrintHtml } from "./waitlistView.ts";

const entries = [
  {
    availabilityLabel: "Golden Circle · Table 612 · 4 seats",
    bookingReference: "ZNG-PRINT1",
    contactLabel: "guest@example.com · 0710000000",
    guestName: "Guest <One>",
    id: "WLT-PRINT1",
    partySize: 4,
    performanceLabel: "31/10/2026 at 17:00 · Zingara Johannesburg",
    sourceLabel: "Secret Guest List",
    status: "waiting" as const,
  },
  {
    availabilityLabel: "No suitable table available",
    contactLabel: "second@example.com",
    guestName: "Second Guest",
    id: "WLT-PRINT2",
    partySize: 7,
    performanceLabel: "31/10/2026 at 17:00 · Zingara Johannesburg",
    sourceLabel: "Waitlist",
    status: "promoted" as const,
  },
];

test("builds an A4 print document containing every matching entry and totals", () => {
  const html = buildWaitlistPrintHtml({
    entries,
    filterSummary: "Status: waiting · Guests: 3-4",
    performanceLabel: "31/10/2026 at 17:00 · Zingara Johannesburg",
    printedAt: "31/10/2026, 07:30",
  });

  assert.match(html, /@page \{ size: A4 landscape;/);
  assert.match(html, /2 matching enquiries/);
  assert.match(html, /11 guests/);
  assert.match(html, /WLT-PRINT1/);
  assert.match(html, /WLT-PRINT2/);
  assert.match(html, /Status: waiting · Guests: 3-4/);
  assert.match(html, /thead \{ display: table-header-group; \}/);
  assert.match(html, /page-break-inside: avoid/);
});

test("escapes customer-controlled print values", () => {
  const html = buildWaitlistPrintHtml({
    entries,
    filterSummary: '<script>alert("filter")</script>',
    performanceLabel: '<script>alert("show")</script>',
    printedAt: "31/10/2026, 07:30",
  });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Guest &lt;One&gt;/);
  assert.match(html, /&lt;script&gt;alert\(&quot;filter&quot;\)&lt;\/script&gt;/);
});
