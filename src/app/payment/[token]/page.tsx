import PaymentLinkClient from "./payment-link-client";

type PaymentLinkPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PaymentLinkPage({ params }: PaymentLinkPageProps) {
  const { token } = await params;

  return <PaymentLinkClient token={decodeURIComponent(token)} />;
}
