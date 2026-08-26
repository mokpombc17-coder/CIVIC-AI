export type CivicProblem = Readonly<{
  type?: string;
  title?: string;
  status: number;
  detail: string;
  code?: string;
  request_id?: string;
}>;

export async function readProblem(response: Response): Promise<CivicProblem> {
  try {
    const value = (await response.json()) as Record<string, unknown>;
    return {
      status: response.status,
      detail:
        typeof value.detail === "string"
          ? value.detail
          : typeof value.message === "string"
            ? value.message
            : "요청을 처리하지 못했습니다.",
      ...(typeof value.type === "string" ? { type: value.type } : {}),
      ...(typeof value.title === "string" ? { title: value.title } : {}),
      ...(typeof value.code === "string" ? { code: value.code } : {}),
      ...(typeof value.request_id === "string" ? { request_id: value.request_id } : {}),
    };
  } catch {
    return { status: response.status, detail: "요청을 처리하지 못했습니다." };
  }
}
