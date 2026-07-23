export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      source: "next-route-handler",
      generatedAt: new Date().toISOString(),
      cachePolicy: "no-store",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
