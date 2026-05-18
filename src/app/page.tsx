import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <h1 className="text-7xl font-bold mb-4 text-center">
        Zingara
      </h1>

      <p className="text-zinc-400 text-xl mb-10 text-center">
        Custom Booking Platform MVP
      </p>

      <Link
        href="/book"
        className="bg-white text-black px-8 py-4 rounded-full text-lg font-semibold hover:bg-zinc-300 transition"
      >
        Book Now
      </Link>
    </main>
  );
}