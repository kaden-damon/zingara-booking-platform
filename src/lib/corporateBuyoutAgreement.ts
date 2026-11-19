export type CorporateBuyoutAgreement = {
  sourceDocument: string;
  sourceSha256: string;
  packageName: string;
  originalBase: number;
  discount: number;
  vat: number;
  gratuity: number;
  addons: { id: string; name: string; amount: number; description: string }[];
  requirements: { strictlyHalaal: number; kosher: number; sourceQuantity: string; allocationUnconfirmed?: boolean };
};

const cents = (n: number) => Math.round(n * 100);
export function validateCorporateBuyoutAgreement(value: CorporateBuyoutAgreement, total: number) {
  if (!value || !value.sourceDocument?.trim() || !/^[a-f0-9]{64}$/.test(value.sourceSha256) ||
    !value.packageName?.trim() || !Array.isArray(value.addons) || value.addons.length > 40) {
    return "A documented buyout component agreement is required.";
  }
  const amounts = [value.originalBase, value.discount, value.vat, value.gratuity, total,
    ...value.addons.map(a => a.amount)];
  if (amounts.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 ||
    Math.abs(n * 100 - cents(n)) > 1e-6) || value.originalBase <= value.discount ||
    cents(value.vat) !== Math.round((cents(value.originalBase) - cents(value.discount)) * 0.15) ||
    cents(value.gratuity) !== Math.round(cents(value.originalBase) * 0.125) ||
    cents(value.originalBase) - cents(value.discount) + cents(value.vat) + cents(value.gratuity) +
      value.addons.reduce((sum, a) => sum + cents(a.amount), 0) !== cents(total)) {
    return "Buyout components, VAT and original-base gratuity must reconcile exactly.";
  }
  if (value.addons.some(a => !/^custom-[a-z0-9-]+$/.test(a.id) || !a.name?.trim() ||
    typeof a.description !== "string") || new Set(value.addons.map(a => a.id)).size !== value.addons.length ||
    !value.requirements || [value.requirements.strictlyHalaal, value.requirements.kosher]
      .some(n => !Number.isInteger(n) || n < 0) || typeof value.requirements.sourceQuantity !== "string" ||
    (value.requirements.allocationUnconfirmed !== undefined && typeof value.requirements.allocationUnconfirmed !== "boolean") ||
    (value.requirements.allocationUnconfirmed && (!value.requirements.sourceQuantity.trim() ||
      value.requirements.strictlyHalaal !== 0 || value.requirements.kosher !== 0))) {
    return "Documented charges and meal requirements are invalid.";
  }
  return null;
}

export function readCorporateBuyoutAgreement(notes: string | null | undefined, total?: number): CorporateBuyoutAgreement | null {
  const prefix = "__zingara_booking_meta__:";
  if (!notes?.startsWith(prefix)) return null;
  try {
    const metadata = JSON.parse(notes.slice(prefix.length));
    const value = metadata.buyoutComponentAgreement as CorporateBuyoutAgreement;
    return metadata.commercialModel === "fixed-buyout-package" && value &&
      !validateCorporateBuyoutAgreement(value, total ?? Number(metadata.totalPrice)) ? value : null;
  } catch { return null; }
}
