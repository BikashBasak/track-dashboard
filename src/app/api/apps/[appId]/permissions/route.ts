import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getPermissions } from "@/lib/playstore/provider";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ appId: string }> },
) {
  const { appId } = await context.params;
  try {
    const permissions = await getPermissions(decodeURIComponent(appId), storefrontFrom(request));
    return Response.json({ permissions });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Permissions failed", 502);
  }
}
