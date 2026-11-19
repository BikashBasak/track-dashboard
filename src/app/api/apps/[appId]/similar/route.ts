import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getSimilar } from "@/lib/playstore/provider";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ appId: string }> },
) {
  const { appId } = await context.params;
  try {
    const similar = await getSimilar(decodeURIComponent(appId), storefrontFrom(request));
    return Response.json({ similar });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Similar apps failed", 502);
  }
}
