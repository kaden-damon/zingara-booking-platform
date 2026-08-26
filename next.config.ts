import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  reactCompiler: true,
  serverExternalPackages: ["exceljs", "passkit-generator"],
};

export default nextConfig;
