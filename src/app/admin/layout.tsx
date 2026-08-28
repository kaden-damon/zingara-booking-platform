import type { Metadata } from "next";

import { staffManifestPath } from "@/lib/pwaManifests";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Zingara Staff",
  },
  applicationName: "Zingara Staff",
  manifest: staffManifestPath,
  title: "Zingara Admin Login",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
