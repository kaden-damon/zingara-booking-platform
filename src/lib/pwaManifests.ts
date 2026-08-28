import type { MetadataRoute } from "next";

export const publicManifestPath = "/manifest.webmanifest";
export const staffManifestPath = "/admin/manifest.webmanifest";

const sharedManifest: Pick<
  MetadataRoute.Manifest,
  "background_color" | "display" | "icons" | "theme_color"
> = {
  background_color: "#050505",
  display: "standalone",
  icons: [
    {
      src: "/brand/wax-seal.png",
      sizes: "256x256",
      type: "image/png",
    },
    {
      src: "/icon",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "/apple-icon",
      sizes: "180x180",
      type: "image/png",
    },
  ],
  theme_color: "#050505",
};

export function getPublicPwaManifest(): MetadataRoute.Manifest {
  return {
    ...sharedManifest,
    description: "The Royal Countess Zingara booking platform",
    id: "/book",
    name: "The Royal Countess Zingara",
    scope: "/",
    short_name: "Zingara",
    start_url: "/book",
  };
}

export function getStaffPwaManifest(): MetadataRoute.Manifest {
  return {
    ...sharedManifest,
    description: "Zingara staff administration and operational quick start",
    id: "/admin",
    name: "Zingara Staff",
    scope: "/admin",
    short_name: "Zingara Staff",
    start_url: "/admin/quick-start",
  };
}
