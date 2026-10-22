import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { createXeroDocumentPdf } from "@/lib/xero/documentPdf";
import { hashQuoteAcceptanceToken } from "@/lib/xero/quoteAcceptance";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return Response.json({ error: "Quotation unavailable." }, { status: 404 });
  const client = getServiceClient();
  if (!client) return Response.json({ error: "Quotation unavailable." }, { status: 503 });
  const { data: link } = await client.from("xero_quote_acceptance_links").select("snapshot,status,expires_at,document_version,document_id").eq("token_hash", hashQuoteAcceptanceToken(token)).maybeSingle();
  if (!link) return Response.json({ error: "Quotation unavailable." }, { status: 404 });
  const { data: quote } = await client.from("xero_documents").select("local_reference,version,status,accepted_version").eq("id", link.document_id).maybeSingle();
  const valid = quote && quote.version === link.document_version && ((link.status === "active" && quote.status === "sent" && Date.parse(link.expires_at) > Date.now()) || (link.status === "accepted" && quote.accepted_version === link.document_version));
  if (!valid) return Response.json({ error: "This quotation was replaced or expired." }, { status: 410 });
  const bytes = createXeroDocumentPdf(link.snapshot);
  return new Response(Buffer.from(bytes), { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${quote.local_reference}.pdf"`, "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff" } });
}
