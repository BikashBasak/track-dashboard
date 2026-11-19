import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getDataSafety } from "@/lib/playstore/provider";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ appId: string }> },
) {
  const { appId } = await context.params;
  try {
    const dataSafety = await getDataSafety(decodeURIComponent(appId), storefrontFrom(request));
    return Response.json({ dataSafety });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Data safety failed", 502);
  }
}
