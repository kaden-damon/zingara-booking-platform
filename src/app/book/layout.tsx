import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Royal Countess Zingara - Book",
};

export default function BookLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
