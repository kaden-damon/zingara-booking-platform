import { getPayFastConfig } from "./config";
import { appendPayFastSignature } from "./signature";
import type {
  PayFastConfig,
  PayFastData,
  PayFastPaymentInput,
  PayFastPaymentStatus,
} from "./types";

export const payFastPaymentStatuses: Record<
  Uppercase<PayFastPaymentStatus>,
  PayFastPaymentStatus
> = {
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  FAILED: "failed",
  PAID: "paid",
  PENDING: "pending",
};

function formatPayFastAmount(amount: number) {
  return amount.toFixed(2);
}

export function createPayFastPaymentData(
  input: PayFastPaymentInput,
  config: PayFastConfig = getPayFastConfig(),
) {
  const data: PayFastData = {
    amount: formatPayFastAmount(input.amount),
    cancel_url: input.cancelUrl ?? config.cancelUrl,
    cell_number: input.cellNumber,
    custom_str1: input.customString1,
    custom_str2: input.customString2,
    custom_str3: input.customString3,
    email_address: input.emailAddress,
    item_description: input.itemDescription,
    item_name: input.itemName,
    m_payment_id: input.merchantPaymentId,
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    name_first: input.nameFirst,
    name_last: input.nameLast,
    notify_url: input.notifyUrl ?? config.notifyUrl,
    return_url: input.returnUrl ?? config.returnUrl,
  };

  return appendPayFastSignature(data, config.passphrase);
}

export function getPayFastPaymentFormAction(
  config: PayFastConfig = getPayFastConfig(),
) {
  return config.processUrl;
}

export function isPayFastSandbox(config: PayFastConfig = getPayFastConfig()) {
  return config.mode === "sandbox";
}
