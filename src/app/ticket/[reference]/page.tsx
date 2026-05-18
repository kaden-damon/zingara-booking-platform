import LiveTicketClient from "./ticket-client";

type TicketPageProps = {
  params: Promise<{
    reference: string;
  }>;
};

export default async function TicketPage({ params }: TicketPageProps) {
  const { reference } = await params;

  return <LiveTicketClient reference={decodeURIComponent(reference)} />;
}
