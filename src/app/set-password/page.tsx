import type { Metadata } from "next";

import SetPasswordClient from "./SetPasswordClient";

export const metadata: Metadata = {
  title: "Set Password | The Royal Countess Zingara",
  robots: {
    follow: false,
    index: false,
  },
};

export default function SetPasswordPage() {
  return <SetPasswordClient />;
}
