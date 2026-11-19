import { jsonError } from "@/lib/api";
import { getAppHistory } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ appId: string }> },
) {
  try {
    const { appId: raw } = await context.params;
    const appId = decodeURIComponent(raw);
    if (!appId) return jsonError("Missing app id");
    const history = await getAppHistory(appId);
    return Response.json(history);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to load history", 500);
  }
}
