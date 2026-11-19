import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getReviews } from "@/lib/playstore/provider";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ appId: string }> },
) {
  const { appId } = await context.params;
  const { searchParams } = new URL(request.url);
  const sort = (searchParams.get("sort") || "newest") as "newest" | "rating" | "helpfulness";
  const token = searchParams.get("token");
  try {
    const data = await getReviews(decodeURIComponent(appId), storefrontFrom(request), {
      sort,
      paginate: true,
      nextPaginationToken: token,
      num: 30,
    });
    return Response.json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Reviews failed", 502);
  }
}
