import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authRole";
import { doApi, doErr, fetchLogUrl, DO_APP_ID } from "@/lib/doApi";

export const runtime = "nodejs";

// GET /api/admin/deploy/logs?deployment_id=xxx&type=BUILD&fetch_content=true
// type: BUILD | DEPLOY | RUN | RUN_RESTARTED (default: BUILD)
// fetch_content=true: downloads log content from presigned URL (last 200KB)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const params = req.nextUrl.searchParams;
  let deploymentId = params.get("deployment_id");
  const logType = params.get("type") ?? "BUILD";
  const fetchContent = params.get("fetch_content") === "true";

  try {
    // If no deployment_id, use the latest
    if (!deploymentId) {
      const deps = await doApi<{ deployments: Array<{ id: string }> }>(
        "GET",
        `/v2/apps/${DO_APP_ID}/deployments?page=1&per_page=1`
      );
      deploymentId = deps.deployments?.[0]?.id;
      if (!deploymentId) {
        return NextResponse.json({ error: "No deployments found" }, { status: 404 });
      }
    }

    const data = await doApi<{
      historic_urls?: string[];
      live_url?: string;
    }>(
      "GET",
      `/v2/apps/${DO_APP_ID}/deployments/${deploymentId}/logs?type=${logType}&follow=false&pod_connection_timeout=3m`
    );

    if (!fetchContent) {
      return NextResponse.json({
        deployment_id: deploymentId,
        type: logType,
        historic_urls: data.historic_urls ?? [],
        live_url: data.live_url ?? null,
      });
    }

    // Fetch actual log content from the first presigned URL
    const url = data.historic_urls?.[0] ?? data.live_url;
    if (!url) {
      return NextResponse.json({
        deployment_id: deploymentId,
        type: logType,
        content: "[No log URLs available yet — build may still be running]",
      });
    }

    const content = await fetchLogUrl(url);
    // Return last 200KB to avoid response size issues
    const trimmed = content.length > 200_000
      ? "...[truncated]...\n" + content.slice(-200_000)
      : content;

    return NextResponse.json({
      deployment_id: deploymentId,
      type: logType,
      content: trimmed,
    });
  } catch (e) {
    return doErr(e);
  }
}
