import { NextResponse } from "next/server";

export const DO_APP_ID = "app-52793cd9-3899-4de4-a41b-0903eed35e88";

/** Raw DO App Platform API call. Throws on non-2xx. */
export async function doApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = process.env.DO_API_TOKEN;
  if (!token) throw new Error("DO_API_TOKEN not configured");

  const res = await fetch(`https://api.digitalocean.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DO API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch presigned log URL content as plain text */
export async function fetchLogUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) return `[log fetch failed: ${res.status}]`;
  return res.text();
}

/** Standard error response */
export function doErr(err: unknown, status = 500): NextResponse {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal error" },
    { status }
  );
}
