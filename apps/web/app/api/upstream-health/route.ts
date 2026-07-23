import { operationsFetch } from "@/lib/server/operations-api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const upstream = await operationsFetch("actuator/health", {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });

    return Response.json(
      {
        reachable: upstream.ok,
        upstreamStatus: upstream.status,
      },
      {
        status: upstream.ok ? 200 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      {
        reachable: false,
        upstreamStatus: null,
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
