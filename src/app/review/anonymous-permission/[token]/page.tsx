import AnonymousReviewPermissionClient from "./AnonymousReviewPermissionClient";

export default async function AnonymousReviewPermissionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AnonymousReviewPermissionClient token={token} />;
}
