import { notFound } from "next/navigation";
import WixReviewsPreviewClient from "./WixReviewsPreviewClient";

export const dynamic = "force-dynamic";

export default function WixReviewsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <WixReviewsPreviewClient />;
}
