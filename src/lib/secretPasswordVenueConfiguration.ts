import type { DemoVenueSettings, EntryLocationKey } from "./zingaraDemo";

type VenueSecretPasswordConfiguration =
  DemoVenueSettings["operationalSettings"]["secretPasswordExperience"][EntryLocationKey];

export function mergeSecretPasswordVenueConfiguration(
  settings: DemoVenueSettings,
  venueLocation: EntryLocationKey,
  configuration: VenueSecretPasswordConfiguration,
) {
  return {
    ...settings,
    operationalSettings: {
      ...settings.operationalSettings,
      secretPasswordExperience: {
        ...settings.operationalSettings.secretPasswordExperience,
        [venueLocation]: configuration,
      },
    },
  };
}
