export const platformOwnerAuthority = "platform-owner" as const;

export function getPolicyDisplayVersion(version: string) {
  return version.match(/-(V\d+)$/i)?.[1]?.toUpperCase() ?? version;
}
