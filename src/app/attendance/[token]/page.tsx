import AttendanceResponseClient from "./AttendanceResponseClient";

export default async function AttendanceResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ response?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const initialResponse =
    query.response === "confirmed" || query.response === "declined"
      ? query.response
      : null;
  return <AttendanceResponseClient initialResponse={initialResponse} token={token} />;
}
