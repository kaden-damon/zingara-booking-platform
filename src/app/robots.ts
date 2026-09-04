import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: ["/", "/book", "/corporate", "/legal"],
      disallow: [
        "/admin",
        "/api",
        "/find-booking",
        "/payment",
        "/ticket",
      ],
      userAgent: "*",
    },
  };
}
