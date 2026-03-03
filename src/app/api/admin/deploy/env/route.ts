import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authRole";
import { doApi, doErr, DO_APP_ID } from "@/lib/doApi";

export const runtime = "nodejs";

interface EnvVar {
  key: string;
  value?: string;
  type?: "GENERAL" | "SECRET";
  scope?: "RUN_AND_BUILD_TIME" | "BUILD_TIME" | "RUN_TIME";
}

interface AppSpec {
  envs?: EnvVar[];
  [key: string]: unknown;
}

// GET /api/admin/deploy/env
// Returns env var keys (values masked for SECRET type by DO API)
export async function GET(): Promise<NextResponse> {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  try {
    const data = await doApi<{ app: { spec: AppSpec } }>(
      "GET",
      `/v2/apps/${DO_APP_ID}`
    );
    const envs = data.app.spec.envs ?? [];
    return NextResponse.json({ envs });
  } catch (e) {
    return doErr(e);
  }
}

// POST /api/admin/deploy/env
// Body: { envs: [{ key, value, type?, scope? }] }
// Upserts env vars and triggers a redeploy automatically
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  try {
    const { envs: newEnvs } = (await req.json()) as { envs: EnvVar[] };
    if (!Array.isArray(newEnvs) || newEnvs.length === 0) {
      return NextResponse.json({ error: "envs array required" }, { status: 400 });
    }

    // Get current spec
    const appData = await doApi<{ app: { spec: AppSpec } }>(
      "GET",
      `/v2/apps/${DO_APP_ID}`
    );
    const spec = appData.app.spec;
    const currentEnvs: EnvVar[] = spec.envs ?? [];

    // Upsert: overwrite matching keys, append new ones
    const updatedEnvs = [...currentEnvs];
    for (const newEnv of newEnvs) {
      const idx = updatedEnvs.findIndex(e => e.key === newEnv.key);
      if (idx >= 0) {
        updatedEnvs[idx] = { ...updatedEnvs[idx], ...newEnv };
      } else {
        updatedEnvs.push({
          type: "GENERAL",
          scope: "RUN_AND_BUILD_TIME",
          ...newEnv,
        });
      }
    }

    spec.envs = updatedEnvs;
    const result = await doApi<{ app: unknown }>(
      "PUT",
      `/v2/apps/${DO_APP_ID}`,
      { spec }
    );

    return NextResponse.json({
      success: true,
      updated_keys: newEnvs.map(e => e.key),
      app: result.app,
    });
  } catch (e) {
    return doErr(e);
  }
}
