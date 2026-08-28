import { getStaffPwaManifest } from "@/lib/pwaManifests";

export function GET() {
  return Response.json(getStaffPwaManifest(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}
