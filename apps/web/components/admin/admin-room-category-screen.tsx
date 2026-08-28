"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { RoomCategorySelector } from "@/components/admin/room-category-selector";
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import {
  DEFAULT_ROOM_CATEGORY_ID,
  readRoomCategory,
  readRoomCategoryAssignment,
  readRoomCategoryPage,
  readRoomDetailCategorySnapshot,
  sortRoomCategories,
  validateCategorySelection,
  type RoomCategory,
  type RoomDetailCategorySnapshot,
} from "@/lib/admin/room-category-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";

export function AdminRoomCategoryScreen({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const [categories, setCategories] = useState<readonly RoomCategory[]>([]);
  const [newName, setNewName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<RoomDetailCategorySnapshot | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/v1/admin/room-categories", {
        cache: "no-store",
      });
      if (!response.ok) {
        setCategories([]);
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return;
      }
      const page = readRoomCategoryPage(await response.json());
      if (!page) {
        setCategories([]);
        setMessage("서버의 카테고리 목록 응답 형식을 확인해야 합니다.");
        return;
      }
      setCategories(sortRoomCategories(page.items));
      setMessage("");
    } catch {
      setCategories([]);
      setMessage("네트워크 오류로 카테고리 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCategories(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/v1/admin/room-categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      const created = readRoomCategory(await response.json());
      if (!created) return setMessage("서버의 카테고리 생성 응답 형식을 확인해야 합니다.");
      setCategories((current) => sortRoomCategories([...current, created]));
      setNewName("");
      setMessage("카테고리를 추가했습니다.");
    } catch {
      setMessage("네트워크 오류로 카테고리를 추가하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function updateCategory(category: RoomCategory, name: string) {
    const normalizedName = name.trim();
    if (!normalizedName || pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/room-categories/${encodeURIComponent(category.categoryId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: normalizedName, expectedVersion: category.version }),
        },
      );
      if (!response.ok) {
        const problem = await readAdminProblem(response);
        if (
          problem.code === "ROOM_CATEGORY_VERSION_CONFLICT" ||
          problem.code === "ROOM_CATEGORY_NOT_FOUND"
        ) {
          await loadCategories();
        }
        setMessage(formatAdminProblem(problem));
        return;
      }
      const updated = readRoomCategory(await response.json());
      if (!updated) return setMessage("서버의 카테고리 수정 응답 형식을 확인해야 합니다.");
      setCategories((current) =>
        sortRoomCategories(
          current.map((item) => (item.categoryId === updated.categoryId ? updated : item)),
        ),
      );
      setMessage("카테고리 이름을 저장했습니다.");
    } catch {
      setMessage("네트워크 오류로 카테고리 이름을 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function deleteCategory(category: RoomCategory) {
    if (pending || category.categoryId === DEFAULT_ROOM_CATEGORY_ID) return;
    if (!window.confirm(`‘${category.name}’ 카테고리를 삭제하시겠습니까?`)) return;
    setPending(true);
    setMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/room-categories/${encodeURIComponent(category.categoryId)}?expectedVersion=${category.version}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const problem = await readAdminProblem(response);
        if (
          problem.code === "ROOM_CATEGORY_VERSION_CONFLICT" ||
          problem.code === "ROOM_CATEGORY_NOT_FOUND"
        ) {
          await loadCategories();
        }
        setMessage(
          problem.code === "ROOM_CATEGORY_IN_USE" && problem.referencedRoomCount !== undefined
            ? `${problem.referencedRoomCount}개 채팅방에서 사용 중이라 삭제할 수 없습니다.`
            : formatAdminProblem(problem),
        );
        return;
      }
      setCategories((current) => current.filter((item) => item.categoryId !== category.categoryId));
      setSelectedCategoryIds((current) => current.filter((id) => id !== category.categoryId));
      setMessage("카테고리를 삭제했습니다.");
    } catch {
      setMessage("네트워크 오류로 카테고리를 삭제하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function loadRoom(force = false) {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId || (pending && !force)) return;
    setPending(true);
    setMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/rooms/${encodeURIComponent(normalizedRoomId)}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) {
        setRoom(null);
        setSelectedCategoryIds([]);
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return;
      }
      const snapshot = readRoomDetailCategorySnapshot(await response.json());
      if (!snapshot) {
        setRoom(null);
        setSelectedCategoryIds([]);
        setMessage("서버의 채팅방 응답 형식을 확인해야 합니다.");
        return;
      }
      setRoom(snapshot);
      setRoomId(snapshot.roomId);
      setSelectedCategoryIds(snapshot.categoryIds);
      setMessage("현재 카테고리 설정을 불러왔습니다.");
    } catch {
      setRoom(null);
      setSelectedCategoryIds([]);
      setMessage("네트워크 오류로 채팅방 설정을 불러오지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function replaceRoomCategories(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || pending) return;
    const validation = validateCategorySelection(selectedCategoryIds);
    if (validation) return setMessage(validation);
    setPending(true);
    setMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/rooms/${encodeURIComponent(room.roomId)}/categories`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ categoryIds: selectedCategoryIds, expectedVersion: room.version }),
        },
      );
      if (!response.ok) {
        const problem = await readAdminProblem(response);
        if (problem.code === "ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT") await loadRoom(true);
        setMessage(formatAdminProblem(problem));
        return;
      }
      const assignment = readRoomCategoryAssignment(await response.json());
      if (!assignment) return setMessage("서버의 카테고리 교체 응답 형식을 확인해야 합니다.");
      setRoom({
        roomId: assignment.roomId,
        categoryIds: assignment.categoryIds,
        version: assignment.roomVersion,
      });
      setSelectedCategoryIds(assignment.categoryIds);
      setMessage(
        assignment.changed
          ? "채팅방 카테고리를 교체했습니다."
          : "선택한 카테고리가 현재 설정과 같아 변경하지 않았습니다.",
      );
    } catch {
      await loadRoom(true);
      setMessage("처리 결과가 불명확하여 채팅방의 최신 설정을 다시 불러왔습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenFrame screen={screen} title="채팅방 카테고리 관리">
      <div
        className="civic-admin-workbench civic-domain-console"
        data-wireflow-layout="room-category-admin"
      >
        <section className="civic-domain-form-section">
          <header>
            <span>ROOM CATEGORY</span>
            <h2>카테고리 목록</h2>
          </header>
          <form className="civic-category-create" onSubmit={createCategory}>
            <label className="civic-field">
              <span>새 카테고리 이름</span>
              <input
                disabled={pending}
                maxLength={50}
                onChange={(event) => setNewName(event.currentTarget.value)}
                required
                value={newName}
              />
            </label>
            <button
              className="civic-primary-action"
              disabled={pending || !newName.trim()}
              type="submit"
            >
              카테고리 추가
            </button>
          </form>
          <CategoryTable
            categories={categories}
            onDelete={(category) => void deleteCategory(category)}
            onUpdate={(category, name) => void updateCategory(category, name)}
            pending={pending}
          />
        </section>

        <section className="civic-domain-form-section">
          <header>
            <span>KNOWN ROOM ID ONLY</span>
            <h2>기존 채팅방 카테고리 교체</h2>
          </header>
          <p className="civic-boundary-copy">
            관리자용 전체 채팅방 검색 API가 없어, 이미 알고 있는 채팅방 ID만 조회하고 변경할 수
            있습니다.
          </p>
          <div className="civic-category-room-lookup">
            <label className="civic-field">
              <span>채팅방 ID</span>
              <input
                disabled={pending}
                onChange={(event) => {
                  setRoomId(event.currentTarget.value);
                  if (event.currentTarget.value !== room?.roomId) setRoom(null);
                }}
                value={roomId}
              />
            </label>
            <button
              className="civic-secondary-action"
              disabled={pending || !roomId.trim()}
              onClick={() => void loadRoom()}
              type="button"
            >
              현재 설정 불러오기
            </button>
          </div>
          {room ? (
            <form className="civic-domain-action-panel" onSubmit={replaceRoomCategories}>
              <RoomCategorySelector
                categories={categories}
                disabled={pending}
                legend="교체할 카테고리"
                onChange={setSelectedCategoryIds}
                selectedCategoryIds={selectedCategoryIds}
              />
              <small>현재 Room version: {room.version}</small>
              <div className="civic-form-actions">
                <button className="civic-primary-action" disabled={pending} type="submit">
                  카테고리 교체
                </button>
              </div>
            </form>
          ) : null}
        </section>

        {loading ? <p aria-live="polite">최신 카테고리를 불러오는 중입니다.</p> : null}
        {message ? (
          <p aria-live="polite" className="civic-form-message" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function CategoryTable({
  categories,
  onDelete,
  onUpdate,
  pending,
}: Readonly<{
  categories: readonly RoomCategory[];
  onDelete: (category: RoomCategory) => void;
  onUpdate: (category: RoomCategory, name: string) => void;
  pending: boolean;
}>) {
  return (
    <div aria-label="카테고리 표" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table civic-category-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>버전</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 ? (
            <tr>
              <td colSpan={3}>등록된 카테고리가 없습니다.</td>
            </tr>
          ) : null}
          {categories.map((category) => (
            <CategoryRow
              category={category}
              key={`${category.categoryId}:${category.version}`}
              onDelete={onDelete}
              onUpdate={onUpdate}
              pending={pending}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRow({
  category,
  onDelete,
  onUpdate,
  pending,
}: Readonly<{
  category: RoomCategory;
  onDelete: (category: RoomCategory) => void;
  onUpdate: (category: RoomCategory, name: string) => void;
  pending: boolean;
}>) {
  const [name, setName] = useState(category.name);
  const isDefault = category.categoryId === DEFAULT_ROOM_CATEGORY_ID;
  return (
    <tr>
      <th scope="row">
        <input
          aria-label="카테고리 이름"
          disabled={pending}
          id={`category-${category.categoryId}`}
          maxLength={50}
          onChange={(event) => setName(event.currentTarget.value)}
          value={name}
        />
      </th>
      <td>{category.version}</td>
      <td>
        <div className="civic-category-actions">
          <button
            className="civic-secondary-action"
            disabled={pending || !name.trim() || name.trim() === category.name}
            onClick={() => onUpdate(category, name)}
            type="button"
          >
            이름 저장
          </button>
          <button
            className="civic-danger-action"
            disabled={pending || isDefault}
            onClick={() => onDelete(category)}
            title={isDefault ? "기본 정책 카테고리는 삭제할 수 없습니다." : undefined}
            type="button"
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
}
