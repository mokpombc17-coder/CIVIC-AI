"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

type SynonymGroup = Readonly<{
  synonym_group_id: string;
  term: string;
  synonyms: readonly string[];
  is_active: boolean;
  updated_at?: string;
}>;

export function parseSynonymInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  );
}

export function synonymGroupPath(groupId: string): string {
  return `/api/v1/rag/synonyms/${encodeURIComponent(groupId)}`;
}

export function AdminRagSynonyms() {
  const [items, setItems] = useState<SynonymGroup[]>([]);
  const [term, setTerm] = useState("");
  const [synonyms, setSynonyms] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch("/api/v1/rag/synonyms", { cache: "no-store" });
    if (!response.ok) throw new Error("동의어 목록을 불러오지 못했습니다.");
    const body = (await response.json()) as { items?: unknown };
    if (!Array.isArray(body.items)) throw new Error("동의어 목록 형식이 올바르지 않습니다.");
    setItems(body.items as SynonymGroup[]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "동의어 목록을 불러오지 못했습니다."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSynonymInput(synonyms);
    if (!term.trim() || parsed.length === 0) {
      setMessage("기준어와 동의어를 각각 하나 이상 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const current = editingId
        ? items.find((item) => item.synonym_group_id === editingId)
        : undefined;
      const response = await authenticatedFetch(
        editingId ? synonymGroupPath(editingId) : "/api/v1/rag/synonyms",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            term: term.trim(),
            synonyms: parsed,
            ...(editingId ? { is_active: current?.is_active ?? true } : {}),
          }),
        },
      );
      if (!response.ok)
        throw new Error("동의어를 저장하지 못했습니다. 중복된 단어인지 확인해 주세요.");
      setTerm("");
      setSynonyms("");
      setEditingId(undefined);
      setMessage("동의어를 저장했습니다.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "동의어를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function updateActive(item: SynonymGroup, isActive: boolean) {
    setBusy(true);
    try {
      const response = await authenticatedFetch(synonymGroupPath(item.synonym_group_id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term: item.term, synonyms: item.synonyms, is_active: isActive }),
      });
      if (!response.ok) throw new Error("동의어 사용 상태를 변경하지 못했습니다.");
      await refresh();
      setMessage(isActive ? "동의어를 검색에 사용합니다." : "동의어를 검색에서 제외했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "동의어 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: SynonymGroup) {
    if (!window.confirm(`‘${item.term}’ 동의어 그룹을 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      const response = await authenticatedFetch(synonymGroupPath(item.synonym_group_id), {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("동의어를 삭제하지 못했습니다.");
      await refresh();
      setMessage("동의어를 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "동의어를 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="civic-inline-upload" data-rag-synonyms="true">
      <summary>
        <span>
          <strong>동의어 관리</strong>
        </span>
        <span aria-hidden="true" className="civic-inline-upload-toggle">
          사전 열기
        </span>
      </summary>
      <div className="civic-inline-upload-body civic-rag-synonyms">
        <p>같은 의미로 검색할 표현을 묶습니다. 변경 내용은 다음 검색부터 반영됩니다.</p>
        <form className="civic-admin-form" onSubmit={save}>
          <label>
            <span>기준어</span>
            <input
              maxLength={120}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="예: 시민 참여"
              value={term}
            />
          </label>
          <label>
            <span>쉼표로 구분한 동의어</span>
            <input
              onChange={(event) => setSynonyms(event.target.value)}
              placeholder="시민참여, 주민 참여"
              value={synonyms}
            />
          </label>
          <button disabled={busy} type="submit">
            {editingId ? "수정 저장" : "동의어 추가"}
          </button>
          {editingId ? (
            <button
              className="civic-secondary-action"
              onClick={() => {
                setEditingId(undefined);
                setTerm("");
                setSynonyms("");
              }}
              type="button"
            >
              취소
            </button>
          ) : null}
        </form>
        {items.length ? (
          <div className="civic-table-scroll" role="region" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>기준어</th>
                  <th>동의어</th>
                  <th>검색 사용</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.synonym_group_id}>
                    <td>{item.term}</td>
                    <td>{item.synonyms.join(", ")}</td>
                    <td>
                      <input
                        aria-label={`${item.term} 검색 사용`}
                        checked={item.is_active}
                        disabled={busy}
                        onChange={(event) => void updateActive(item, event.target.checked)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <div className="civic-row-actions">
                        <button
                          onClick={() => {
                            setEditingId(item.synonym_group_id);
                            setTerm(item.term);
                            setSynonyms(item.synonyms.join(", "));
                          }}
                          type="button"
                        >
                          수정
                        </button>
                        <button
                          className="is-danger"
                          onClick={() => void remove(item)}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="civic-admin-empty">등록한 동의어가 없습니다.</p>
        )}
        {message ? <p aria-live="polite">{message}</p> : null}
      </div>
    </details>
  );
}
