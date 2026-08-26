import {
  AppleWalletConfigurationError,
  AppleWalletTicketDataError,
  createAppleWalletPass,
} from "@/lib/appleWalletPass";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketWalletRouteContext = {
  params: Promise<{
    reference: string;
  }>;
};

function safeFilenameTicketCode(ticketCode: string) {
  return ticketCode.replace(/[^A-Z0-9-]/gi, "-");
}

export async function GET(
  request: Request,
  context: TicketWalletRouteContext,
) {
  try {
    const { reference } = await context.params;
    const result = await createAppleWalletPass(reference, request.url);

    if (!result) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="Zingara-${safeFilenameTicketCode(result.ticketCode)}.pkpass"`,
        "Content-Type": "application/vnd.apple.pkpass",
      },
    });
  } catch (error) {
    if (error instanceof AppleWalletTicketDataError) {
      return Response.json(
        { error: "This ticket does not contain enough information for Apple Wallet." },
        { status: 422 },
      );
    }

    if (error instanceof AppleWalletConfigurationError) {
      return Response.json(
        { error: "Apple Wallet is not currently available." },
        { status: 503 },
      );
    }

    console.error("[Apple Wallet] Pass generation failed.");

    return Response.json(
      { error: "Apple Wallet pass could not be prepared." },
      { status: 500 },
    );
  }
}
