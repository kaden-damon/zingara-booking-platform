export type BookingCompanyIdentity = {
  legal_name?: string | null;
  trading_name?: string | null;
};

function cleanCompanyName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function resolveBookingCompanyName({
  linkedCompany,
  storedCompanyName,
}: {
  linkedCompany?: BookingCompanyIdentity | null;
  storedCompanyName?: string | null;
}) {
  return (
    cleanCompanyName(linkedCompany?.trading_name) ||
    cleanCompanyName(linkedCompany?.legal_name) ||
    cleanCompanyName(storedCompanyName)
  );
}
