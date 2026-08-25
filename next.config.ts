import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/admin/analytics/table-plan": [
      "src/templates/Zingara_Table_Plan_Master_Template.xlsx",
    ],
  },
  reactCompiler: true,
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
