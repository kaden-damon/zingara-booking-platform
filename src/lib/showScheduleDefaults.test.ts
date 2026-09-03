import assert from "node:assert/strict";
import test from "node:test";

import { getStandardShowTime } from "./showScheduleDefaults.ts";

test("Johannesburg schedules default to 17:00", () => {
  assert.equal(getStandardShowTime("johannesburg"), "17:00");
});

test("Cape Town schedules default to 18:00", () => {
  assert.equal(getStandardShowTime("cape-town"), "18:00");
});
