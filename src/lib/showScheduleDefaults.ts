import type { EntryLocationKey } from "./zingaraDemo";

const standardShowTimes: Record<EntryLocationKey, string> = {
  "cape-town": "18:00",
  johannesburg: "17:00",
};

export function getStandardShowTime(location: EntryLocationKey) {
  return standardShowTimes[location];
}
