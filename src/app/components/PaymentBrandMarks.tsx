import { paymentBrandAssets, paymentBrandDisclosure } from "@/lib/royalDecrees";

type PaymentBrandMarksProps = {
  compact?: boolean;
};

export default function PaymentBrandMarks({
  compact = false,
}: PaymentBrandMarksProps) {
  return (
    <div>
      <div
        className={
          compact
            ? "flex flex-wrap items-center justify-center gap-x-5 gap-y-3"
            : "flex flex-wrap items-center justify-center gap-x-6 gap-y-4"
        }
      >
        {paymentBrandAssets.map((asset) => (
          <img
            key={asset.label}
            src={asset.src}
            alt={asset.alt}
            className={asset.className}
            loading="lazy"
            title={asset.label}
          />
        ))}
      </div>
      <p
        className={
          compact
            ? "mt-3 text-center text-[0.62rem] leading-4 text-white/75"
            : "mt-4 text-center text-xs leading-5 text-zinc-300"
        }
      >
        {paymentBrandDisclosure}
      </p>
    </div>
  );
}
