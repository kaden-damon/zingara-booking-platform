import QuoteAcceptanceClient from "./QuoteAcceptanceClient";

export default async function QuoteAcceptancePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <QuoteAcceptanceClient token={token} />;
}
