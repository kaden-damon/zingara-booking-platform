export type PayFastMode = "live" | "sandbox";

export type PayFastPaymentStatus =
  | "cancelled"
  | "expired"
  | "failed"
  | "paid"
  | "pending";

export type PayFastFieldValue = boolean | number | string | null | undefined;

export type PayFastData = Record<string, PayFastFieldValue>;

export type PayFastConfig = {
  cancelUrl: string;
  configured: boolean;
  merchantId: string;
  merchantKey: string;
  mode: PayFastMode;
  notifyUrl: string;
  onsiteProcessUrl: string;
  passphrase: string;
  processUrl: string;
  returnUrl: string;
  validateUrl: string;
};

export type PayFastPaymentInput = {
  amount: number;
  cancelUrl?: string;
  cellNumber?: string;
  customString1?: string;
  customString2?: string;
  customString3?: string;
  emailAddress?: string;
  itemDescription?: string;
  itemName: string;
  merchantPaymentId: string;
  nameFirst?: string;
  nameLast?: string;
  notifyUrl?: string;
  returnUrl?: string;
};
