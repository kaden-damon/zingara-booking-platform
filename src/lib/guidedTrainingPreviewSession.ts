import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { GuidedTrainingModuleId } from "./guidedTraining";

export const guidedTrainingPreviewCookie = "zingara_guided_training_preview";
const lifetimeSeconds = 60 * 60 * 8;

type PreviewSession = {
  expiresAt: number;
  moduleId: GuidedTrainingModuleId;
};

function getSecret() {
  if (process.env.NODE_ENV === "production") return null;
  return process.env.ACADEMY_GUIDED_TRAINING_PREVIEW_KEY?.trim() || null;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createGuidedTrainingPreviewSession(moduleId: GuidedTrainingModuleId) {
  const secret = getSecret();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    moduleId,
  } satisfies PreviewSession)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyGuidedTrainingPreviewSession(
  token: string | null | undefined,
  expectedModuleId?: GuidedTrainingModuleId,
) {
  const secret = getSecret();
  if (!secret || !token) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = sign(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PreviewSession;
    if (
      session.expiresAt <= Math.floor(Date.now() / 1000) ||
      (expectedModuleId && session.moduleId !== expectedModuleId)
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export const guidedTrainingPreviewCookieMaxAge = lifetimeSeconds;
