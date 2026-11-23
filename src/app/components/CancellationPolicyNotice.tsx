import Link from "next/link";

export default function CancellationPolicyNotice() {
  return <aside aria-label="Cancellation and guest reductions" className="rounded-xl border border-white/15 bg-black/20 p-3 text-sm leading-6 text-zinc-300">
    <p className="font-semibold text-white">Cancellation & guest reductions</p>
    <p>Standard: 5 days before the show. Late reductions forfeit R550 per cancelled guest. Corporate: 7 days; late cancellations or reductions forfeit cancelled tickets and their prepaid gratuity. Remaining guests’ gratuity stays allocated.</p>
    <p>Forfeited amounts cannot become refunds or bar credit. Eligible refunds follow the authorised process. Buyouts and signed agreements retain their separate terms.</p>
    <Link href="/royal-decrees/booking-and-cancellation-policy" target="_blank" className="font-semibold text-[#F2D66C] underline underline-offset-4">Read the cancellation policy</Link>
  </aside>;
}
