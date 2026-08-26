"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type RagFeedbackValue = "HELPFUL" | "UNHELPFUL";

export async function submitRagFeedback(
  jobId: string,
  value: RagFeedbackValue,
  request: typeof fetch = authenticatedFetch,
): Promise<RagFeedbackValue> {
  const response = await request(`/api/v1/rag/queries/${encodeURIComponent(jobId)}/feedback`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) throw new Error("feedback request failed");
  const body = (await response.json()) as { value?: unknown };
  if (body.value !== "HELPFUL" && body.value !== "UNHELPFUL") {
    throw new Error("feedback response is invalid");
  }
  return body.value;
}

export function RagFeedback({
  jobId,
  initialValue,
}: Readonly<{ jobId: string; initialValue?: RagFeedbackValue }>) {
  const [value, setValue] = useState<RagFeedbackValue | undefined>(initialValue);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function choose(next: RagFeedbackValue) {
    if (saving || next === value) return;
    setSaving(true);
    setMessage("");
    try {
      setValue(await submitRagFeedback(jobId, next));
      setMessage("평가를 저장했습니다.");
    } catch {
      setMessage("평가를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div aria-label="답변 평가" className="civic-rag-feedback">
      <span>이 답변이 도움이 되었나요?</span>
      <button
        aria-pressed={value === "HELPFUL"}
        disabled={saving}
        onClick={() => void choose("HELPFUL")}
        type="button"
      >
        도움됨
      </button>
      <button
        aria-pressed={value === "UNHELPFUL"}
        disabled={saving}
        onClick={() => void choose("UNHELPFUL")}
        type="button"
      >
        도움 안 됨
      </button>
      {message ? <small aria-live="polite">{message}</small> : null}
    </div>
  );
}
