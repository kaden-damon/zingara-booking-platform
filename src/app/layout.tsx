import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import PwaRuntime from "./components/PwaRuntime";
import ZingaraHeader from "./components/ZingaraHeader";
import { defaultZingaraFaviconUrl } from "../lib/zingaraDemo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ebGaramondMedium = localFont({
  src: "./fonts/EBGaramond-Medium.ttf",
  variable: "--font-zingara-heading",
});

const ebGaramondRegular = localFont({
  src: "./fonts/EBGaramond-Regular.ttf",
  variable: "--font-zingara-subheading",
});

export const metadata: Metadata = {
  applicationName: "Zingara",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Zingara",
  },
  title: "Zingara",
  description: "The Royal Countess Zingara booking platform",
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: defaultZingaraFaviconUrl,
        sizes: "256x256",
        type: "image/png",
      },
      {
        url: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcut: [
      {
        url: defaultZingaraFaviconUrl,
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${ebGaramondMedium.variable} ${ebGaramondRegular.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRuntime />
        <ZingaraHeader />
        {children}
      </body>
    </html>
  );
}
