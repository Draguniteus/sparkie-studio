import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authRole";
import { doApi, doErr, DO_APP_ID } from "@/lib/doApi";

export const runtime = "nodejs";

// GET /api/admin/deploy?limit=5
// Returns latest deployments with phase + cause
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  try {
    const limit = req.nextUrl.searchParams.get("limit") ?? "5";
    const data = await doApi<{ deployments: unknown[] }>(
      "GET",
      `/v2/apps/${DO_APP_ID}/deployments?page=1&per_page=${limit}`
    );
    const app = await doApi<{ app: { active_deployment: unknown } }>(
      "GET",
      `/v2/apps/${DO_APP_ID}`
    );
    return NextResponse.json({
      active_deployment: (app.app as { active_deployment: unknown }).active_deployment,
      recent_deployments: data.deployments,
    });
  } catch (e) {
    return doErr(e);
  }
}

// POST /api/admin/deploy
// Body: {} → triggers new deploy (force_build: true)
export async function POST(): Promise<NextResponse> {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  try {
    const data = await doApi<{ deployment: unknown }>(
      "POST",
      `/v2/apps/${DO_APP_ID}/deployments`,
      { force_build: true }
    );
    return NextResponse.json({ deployment: data.deployment });
  } catch (e) {
    return doErr(e);
  }
}

// DELETE /api/admin/deploy?deployment_id=xxx
// Cancels a running deployment
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  const deploymentId = req.nextUrl.searchParams.get("deployment_id");
  if (!deploymentId) {
    return NextResponse.json({ error: "deployment_id required" }, { status: 400 });
  }
  try {
    await doApi(
      "POST",
      `/v2/apps/${DO_APP_ID}/deployments/${deploymentId}/cancel`
    );
    return NextResponse.json({ cancelled: true, deployment_id: deploymentId });
  } catch (e) {
    return doErr(e);
  }
}

// PUT /api/admin/deploy
// Body: { deployment_id: string, skip_pin?: boolean }
// Rolls back to a previous deployment
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  try {
    const { deployment_id, skip_pin } = (await req.json()) as {
      deployment_id: string;
      skip_pin?: boolean;
    };
    if (!deployment_id) {
      return NextResponse.json({ error: "deployment_id required" }, { status: 400 });
    }
    const data = await doApi<{ deployment: unknown }>(
      "POST",
      `/v2/apps/${DO_APP_ID}/rollback`,
      { deployment_id, skip_pin: skip_pin ?? false }
    );
    return NextResponse.json({ deployment: data.deployment });
  } catch (e) {
    return doErr(e);
  }
}
