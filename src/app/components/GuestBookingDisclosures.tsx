import {
  getGuestPaymentDisclosures,
  getGuestVenueInclusions,
} from "@/lib/guestDisclosures";

type GuestBookingDisclosuresProps = {
  balanceOutstanding?: number | null;
  className?: string;
  serviceFeeAmount?: number | null;
  venue?: string | null;
};

export default function GuestBookingDisclosures({
  balanceOutstanding,
  className = "",
  serviceFeeAmount,
  venue,
}: GuestBookingDisclosuresProps) {
  const inclusions = getGuestVenueInclusions(venue);
  const paymentNotices = getGuestPaymentDisclosures({
    balanceOutstanding,
    serviceFeeAmount,
  });

  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 ${className}`.trim()}
      data-guest-booking-disclosures
    >
      {inclusions.length > 0 && (
        <section className="rounded-2xl border border-[#D8C36A]/25 bg-black/30 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
            Your Experience Includes
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-300">
            {inclusions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-2xl border border-[#D8C36A]/25 bg-black/30 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
          Payment &amp; Gratuity
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-300">
          {paymentNotices.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
