import type { MetadataRoute } from "next";

import { getPublicPwaManifest } from "@/lib/pwaManifests";

export default function manifest(): MetadataRoute.Manifest {
  return getPublicPwaManifest();
}
