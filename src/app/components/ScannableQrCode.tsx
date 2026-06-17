"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import { defaultZingaraFaviconUrl } from "../../lib/zingaraDemo";

type ScannableQrCodeProps = {
  className?: string;
  label?: string;
  logoUrl?: string;
  value: string;
};

function getAbsoluteQrValue(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (typeof window === "undefined") {
    return value;
  }

  return new URL(value, window.location.origin).toString();
}

export default function ScannableQrCode({
  className = "",
  label,
  logoUrl = defaultZingaraFaviconUrl,
  value,
}: ScannableQrCodeProps) {
  const qrValue = useMemo(() => getAbsoluteQrValue(value), [value]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let isMounted = true;

    QRCode.toDataURL(qrValue, {
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "H",
      margin: 2,
      scale: 8,
      type: "image/png",
      width: 320,
    }).then((dataUrl) => {
      if (isMounted) {
        setQrDataUrl(dataUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [qrValue]);

  return (
    <div
      className={`relative aspect-square w-full max-w-[18rem] overflow-hidden rounded-2xl border border-white/15 bg-white p-3 shadow-[0_0_50px_rgba(216,195,106,0.2)] ${className}`}
      aria-label={label ?? "Scannable ticket QR code"}
    >
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt={label ?? "Scannable ticket QR code"}
          className="block h-full w-full rounded-xl"
        />
      ) : (
        <div className="h-full w-full animate-pulse rounded-xl bg-zinc-200" />
      )}

      <div className="pointer-events-none absolute left-1/2 top-1/2 grid h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#D8C36A]/35 bg-white p-1 shadow-[0_0_18px_rgba(0,0,0,0.22)]">
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full rounded-full object-contain"
        />
      </div>
    </div>
  );
}
