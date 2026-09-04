import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const browserSecurityHeaders = [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    const privateNoStoreHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ];

    return [
      { source: "/:path*", headers: browserSecurityHeaders },
      { source: "/admin/:path*", headers: privateNoStoreHeaders },
      { source: "/find-booking", headers: privateNoStoreHeaders },
      { source: "/payment/:path*", headers: privateNoStoreHeaders },
      { source: "/ticket/:path*", headers: privateNoStoreHeaders },
      { source: "/api/admin/:path*", headers: privateNoStoreHeaders },
      { source: "/api/find-booking", headers: privateNoStoreHeaders },
      { source: "/api/payment-links/:path*", headers: privateNoStoreHeaders },
      { source: "/api/payfast/:path*", headers: privateNoStoreHeaders },
      { source: "/api/tickets/:path*", headers: privateNoStoreHeaders },
    ];
  },
  outputFileTracingIncludes: {
    "/api/admin/analytics/table-plan": [
      "src/templates/Zingara_Table_Plan_Master_Template.xlsx",
    ],
    "/api/tickets/[reference]/apple-wallet": [
      "src/templates/apple-wallet/*.png",
    ],
    "/api/apple-wallet/v1/passes/[passTypeIdentifier]/[serialNumber]": [
      "src/templates/apple-wallet/*.png",
    ],
  },
  poweredByHeader: false,
  reactCompiler: true,
  serverExternalPackages: ["exceljs", "passkit-generator"],
};

export default nextConfig;
