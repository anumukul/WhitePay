import { NextResponse } from "next/server";
import { consumeDownload } from "@/lib/db/entitlements";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new NextResponse("missing token", { status: 400 });
  const result = consumeDownload(token);
  if (!result.ok) return new NextResponse(result.reason ?? "forbidden", { status: 403 });

  const body = `WhitePay Shop Demo — Guide to Whitechain

Order: ${result.orderId}
Downloaded at: ${new Date().toISOString()}

This is a placeholder digital product. In a real shop this would be a PDF, zip, or signed CDN URL.`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="guide-${result.orderId}.txt"`,
    },
  });
}
