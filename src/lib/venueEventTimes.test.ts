import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCustomerExperienceSchedule,
  getCustomerExperienceTimes,
} from "./experienceTimes.ts";
import { getStandardShowTime } from "./showScheduleDefaults.ts";
import { defaultVenueSettings } from "./zingaraDemo.ts";

const approvedEventTimes = {
  groundsOpen: "17:00",
  guestSeating: "18:30",
  showStarts: "19:30",
};

test("Cape Town and Johannesburg use the approved customer event times", () => {
  for (const location of ["cape-town", "johannesburg"] as const) {
    const times = getCustomerExperienceTimes(defaultVenueSettings, location);

    assert.deepEqual(times, approvedEventTimes);
    assert.equal(
      formatCustomerExperienceSchedule(times!),
      [
        "YOUR EVENING",
        "Grounds Open — 17:00",
        "Guest Seating — 18:30",
        "Show Starts — 19:30",
        "Please arrive after grounds open and allow sufficient time to be seated before the show begins.",
      ].join("\n"),
    );
  }
});

test("customer event times do not change operational show times", () => {
  assert.equal(getStandardShowTime("cape-town"), "18:00");
  assert.equal(getStandardShowTime("johannesburg"), "17:00");
});
