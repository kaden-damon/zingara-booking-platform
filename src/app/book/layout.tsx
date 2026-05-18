import type { Metadata } from "next";

import ZingaraHeader from "../components/ZingaraHeader";

export const metadata: Metadata = {
  title: "The Royal Countess Zingara - Book",
};

export default function BookLayout({
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
