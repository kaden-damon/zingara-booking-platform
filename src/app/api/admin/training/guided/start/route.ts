import { NextResponse } from "next/server";

import { isGuidedTrainingModuleId } from "@/lib/guidedTraining";
import {
  createGuidedTrainingPreviewSession,
  guidedTrainingPreviewCookie,
  guidedTrainingPreviewCookieMaxAge,
} from "@/lib/guidedTrainingPreviewSession";

export const dynamic = "force-dynamic";

function browserOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http"
    ? `${forwardedProtocol}:`
    : requestUrl.protocol;

  return host ? `${protocol}//${host}` : requestUrl.origin;
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const configuredKey = process.env.ACADEMY_GUIDED_TRAINING_PREVIEW_KEY;
  const suppliedKey = url.searchParams.get("key");
  const moduleId = url.searchParams.get("module");
  if (!configuredKey || suppliedKey !== configuredKey || !isGuidedTrainingModuleId(moduleId)) {
    return new Response("Not found", { status: 404 });
  }
  const token = createGuidedTrainingPreviewSession(moduleId);
  if (!token) return new Response("Training preview is unavailable.", { status: 503 });
  // Next dev exposes its bind address in request.url. Preserve the browser's
  // host so the signed preview cookie also works from localhost and LAN URLs.
  const destination = new URL("/admin", browserOrigin(request));
  destination.searchParams.set("guidedTraining", moduleId);
  const response = NextResponse.redirect(destination);
  response.cookies.set(guidedTrainingPreviewCookie, token, {
    httpOnly: true,
    maxAge: guidedTrainingPreviewCookieMaxAge,
    path: "/",
    sameSite: "strict",
    secure: false,
  });
  return response;
}
