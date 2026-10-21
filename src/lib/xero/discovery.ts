export type XeroDiscoveredAccount = {
  accountId: string;
  bankAccountSuffix: string;
  code: string;
  eftAccountMatch: boolean;
  enablePaymentsToAccount: boolean;
  name: string;
  payfastIdentifierMatch: boolean;
  status: string;
  taxType: string;
  type: string;
};

export type XeroDiscoveredTaxRate = {
  canApplyToRevenue: boolean;
  displayRate: number;
  effectiveRate: number;
  name: string;
  status: string;
  taxType: string;
};

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue { return value && typeof value === "object" ? value as RecordValue : {}; }
function rows(value: unknown, key: string) { const result = record(value)[key]; return Array.isArray(result) ? result.map(record) : []; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function digits(value: unknown) { return text(value).replace(/\D/g, ""); }

export function normaliseXeroDiscovery(input: { accounts: unknown; actions?: unknown; bankAccounts?: unknown; invoiceReminders?: unknown; organisation: unknown; taxRates: unknown; tracking?: unknown }) {
  const accountRows = [...rows(input.accounts, "Accounts"), ...rows(input.bankAccounts, "Accounts")];
  const accounts = Array.from(new Map(accountRows.map((account) => [text(account.AccountID), account])).values()).map<XeroDiscoveredAccount>((account) => {
    const bankAccountNumber = digits(account.BankAccountNumber);
    return {
      accountId: text(account.AccountID),
      bankAccountSuffix: bankAccountNumber.slice(-4),
      code: text(account.Code),
      eftAccountMatch: bankAccountNumber.endsWith("8468"),
      enablePaymentsToAccount: account.EnablePaymentsToAccount === true,
      name: text(account.Name),
      payfastIdentifierMatch: bankAccountNumber === "36090701",
      status: text(account.Status),
      taxType: text(account.TaxType),
      type: text(account.Type),
    };
  }).filter((account) => account.accountId && account.name && account.status === "ACTIVE" && (account.code || account.type === "BANK" || account.enablePaymentsToAccount))
    .sort((left, right) => (left.code || left.name).localeCompare(right.code || right.name, undefined, { numeric: true }));
  const taxRates = rows(input.taxRates, "TaxRates").map<XeroDiscoveredTaxRate>((taxRate) => ({
    canApplyToRevenue: taxRate.CanApplyToRevenue === true,
    displayRate: number(taxRate.DisplayTaxRate),
    effectiveRate: number(taxRate.EffectiveRate),
    name: text(taxRate.Name),
    status: text(taxRate.Status),
    taxType: text(taxRate.TaxType),
  })).filter((taxRate) => taxRate.taxType && taxRate.name && taxRate.status !== "DELETED")
    .sort((left, right) => left.name.localeCompare(right.name));
  const organisation = rows(input.organisation, "Organisations")[0] ?? {};
  return {
    accounts,
    actions: rows(input.actions, "Actions").map((action) => ({ name: text(action.Name), status: text(action.Status) })).filter((action) => action.name),
    invoiceNumbering: "Xero generated",
    invoiceRemindersEnabled: rows(input.invoiceReminders, "InvoiceReminders")[0]?.Enabled === true,
    organisation: {
      baseCurrency: text(organisation.BaseCurrency),
      defaultSalesTax: text(organisation.DefaultSalesTax),
      isDemoCompany: organisation.IsDemoCompany === true,
      legalName: text(organisation.LegalName),
      name: text(organisation.Name),
      organisationId: text(organisation.OrganisationID),
      organisationStatus: text(organisation.OrganisationStatus),
      paymentTerms: organisation.PaymentTerms ?? null,
    },
    bankAccountCount: accounts.filter((account) => account.type === "BANK").length,
    paymentAccounts: accounts.filter((account) => account.type === "BANK" || account.enablePaymentsToAccount),
    taxRates,
    trackingCategories: rows(input.tracking, "TrackingCategories").map((category) => ({ id: text(category.TrackingCategoryID), name: text(category.Name), status: text(category.Status) })).filter((category) => category.id && category.status === "ACTIVE"),
  };
}

export function verifiedXeroMapping(input: {
  accountCode: string;
  accountId: string;
  category: string;
  discovery: ReturnType<typeof normaliseXeroDiscovery>;
  taxCode?: string;
}) {
  const account = input.discovery.accounts.find((candidate) => candidate.accountId === input.accountId && (!candidate.code || candidate.code === input.accountCode));
  if (!account) throw new Error("Choose an active account from the connected Xero organisation.");
  if (input.category === "payfast_clearing_account" || input.category === "eft_payment_account") {
    if (!input.discovery.paymentAccounts.some((candidate) => candidate.accountId === account.accountId)) throw new Error("Choose an active Xero payment account.");
    if (input.category === "payfast_clearing_account" && !account.payfastIdentifierMatch) throw new Error("Choose the verified PayFast Clearing Account ending 0701.");
    if (input.category === "eft_payment_account" && !account.eftAccountMatch) throw new Error("Choose the verified FNB main bank account ending 8468.");
    return { account, taxRate: null };
  }
  const taxRate = input.discovery.taxRates.find((candidate) => candidate.taxType === input.taxCode && candidate.canApplyToRevenue);
  if (!taxRate) throw new Error("Choose an active Xero sales tax treatment.");
  if (input.category === "gratuity" && (taxRate.taxType !== "NONE" || taxRate.name !== "No VAT" || taxRate.effectiveRate !== 0)) {
    throw new Error("Gratuity requires Xero's verified NONE - No VAT sales treatment.");
  }
  if (["ticket_sales", "corporate", "buyouts", "booking_fee", "addons", "discounts"].includes(input.category) && taxRate.effectiveRate !== 15) throw new Error("Choose the verified 15% standard sales treatment.");
  return { account, taxRate };
}
