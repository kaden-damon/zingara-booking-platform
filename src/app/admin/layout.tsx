import type { Metadata } from "next";

import ZingaraHeader from "../components/ZingaraHeader";

export const metadata: Metadata = {
  title: "Zingara Admin Login",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <ZingaraHeader />
      {children}
    </>
  );
}
