"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AdminChatOperationsLayout } from "@/components/admin/admin-chat-operations-layout";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { RoomCategorySelector } from "@/components/admin/room-category-selector";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ConsoleSearchControl } from "@/components/admin/console/console-ui";
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import {
  DEFAULT_ROOM_CATEGORY_ID,
  readListedRoomPage,
  readRoomCategory,
  readRoomCategoryAssignment,
  readRoomCategoryPage,
  readRoomDetailCategorySnapshot,
  sortRoomCategories,
  validateCategorySelection,
  type ListedRoom,
  type RoomCategory,
  type RoomDetailCategorySnapshot,
} from "@/lib/admin/room-category-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";

export function AdminRoomCategoryScreen({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const [categories, setCategories] = useState<readonly RoomCategory[]>([]);
  const [listedRooms, setListedRooms] = useState<readonly ListedRoom[]>([]);
  const [newName, setNewName] = useState("");
  const [roomQuery, setRoomQuery] = useState("");
  const [roomNextCursor, setRoomNextCursor] = useState<string | null>(null);
  const [roomHasNext, setRoomHasNext] = useState(false);
  const [room, setRoom] = useState<RoomDetailCategorySnapshot | null>(null);
  const [selectedRoomName, setSelectedRoomName] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<RoomCategory | null>(null);
  const [message, setMessage] = useState("");
  const [roomListMessage, setRoomListMessage] = useState("");
  const roomListGeneration = useRef(0);

  const categoryNamesById = useMemo(
    () => new Map(categories.map((category) => [category.categoryId, category.name])),
    [categories],
  );
  const visibleListedRooms = useMemo(() => {
    const normalizedQuery = roomQuery.trim().toLocaleLowerCase("ko-KR");
    if (!normalizedQuery) return listedRooms;
    return listedRooms.filter((listedRoom) =>
      listedRoom.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
    );
  }, [listedRooms, roomQuery]);

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

  const loadListedRooms = useCallback(
    async (query = "", cursor: string | null = null, append = false) => {
      const currentGeneration = ++roomListGeneration.current;
      setRoomsLoading(true);
      setRoomListMessage("");
      if (!append) {
        setRoomNextCursor(null);
        setRoomHasNext(false);
      }
      const parameters = new URLSearchParams({ limit: "50" });
      const normalizedQuery = query.trim();
      if (normalizedQuery) parameters.set("query", normalizedQuery);
      if (cursor) parameters.set("cursor", cursor);
      try {
        const response = await authenticatedFetch(`/api/v1/rooms?${parameters.toString()}`, {
          cache: "no-store",
        });
        if (currentGeneration !== roomListGeneration.current) return;
        if (!response.ok) {
          const problem = await readAdminProblem(response);
          if (currentGeneration === roomListGeneration.current) {
            if (!append) setListedRooms([]);
            setRoomListMessage(formatAdminProblem(problem));
          }
          return;
        }
        const page = readListedRoomPage(await response.json());
        if (currentGeneration !== roomListGeneration.current) return;
        if (!page) {
          if (!append) setListedRooms([]);
          setRoomListMessage("서버의 토론방 목록 응답 형식을 확인해야 합니다.");
          return;
        }
        setListedRooms((current) => (append ? mergeListedRooms(current, page.items) : page.items));
        setRoomNextCursor(page.nextCursor);
        setRoomHasNext(page.hasNext);
      } catch {
        if (currentGeneration === roomListGeneration.current) {
          if (!append) setListedRooms([]);
          setRoomListMessage("네트워크 오류로 토론방 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (currentGeneration === roomListGeneration.current) setRoomsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCategories(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories]);

  useEffect(() => {
    const normalizedQuery = roomQuery.trim();
    const timer = window.setTimeout(
      () => void loadListedRooms(normalizedQuery),
      normalizedQuery ? 200 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      roomListGeneration.current += 1;
    };
  }, [loadListedRooms, roomQuery]);

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

  async function deleteCategory() {
    const category = categoryToDelete;
    if (!category || pending || category.categoryId === DEFAULT_ROOM_CATEGORY_ID) {
      setCategoryToDelete(null);
      return;
    }
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
            ? `${problem.referencedRoomCount}개 토론방에서 사용 중이라 삭제할 수 없습니다.`
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
      setCategoryToDelete(null);
    }
  }

  function selectListedRoom(selected: ListedRoom) {
    setRoom({
      roomId: selected.roomId,
      categoryIds: selected.categoryIds,
      version: selected.version,
    });
    setSelectedRoomName(selected.name);
    setSelectedCategoryIds(selected.categoryIds);
    setMessage("");
  }

  function closeRoomEditor() {
    setRoom(null);
    setSelectedRoomName("");
    setSelectedCategoryIds([]);
    setMessage("");
  }

  async function loadRoom(roomId: string, force = false) {
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
        setSelectedRoomName("");
        setSelectedCategoryIds([]);
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return;
      }
      const snapshot = readRoomDetailCategorySnapshot(await response.json());
      if (!snapshot) {
        setRoom(null);
        setSelectedRoomName("");
        setSelectedCategoryIds([]);
        setMessage("서버의 토론방 응답 형식을 확인해야 합니다.");
        return;
      }
      setRoom(snapshot);
      setSelectedRoomName(
        (current) =>
          listedRooms.find((listedRoom) => listedRoom.roomId === snapshot.roomId)?.name ?? current,
      );
      setSelectedCategoryIds(snapshot.categoryIds);
      setMessage("현재 카테고리 설정을 불러왔습니다.");
    } catch {
      setRoom(null);
      setSelectedRoomName("");
      setSelectedCategoryIds([]);
      setMessage("네트워크 오류로 토론방 설정을 불러오지 못했습니다.");
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
        if (problem.code === "ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT") {
          await loadRoom(room.roomId, true);
        }
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
      setListedRooms((current) =>
        current.map((listedRoom) =>
          listedRoom.roomId === assignment.roomId
            ? {
                ...listedRoom,
                categoryIds: assignment.categoryIds,
                version: assignment.roomVersion,
              }
            : listedRoom,
        ),
      );
      setSelectedCategoryIds(assignment.categoryIds);
      setMessage(
        assignment.changed
          ? "토론방 카테고리를 교체했습니다."
          : "선택한 카테고리가 현재 설정과 같아 변경하지 않았습니다.",
      );
    } catch {
      await loadRoom(room.roomId, true);
      setMessage("처리 결과가 불명확하여 토론방의 최신 설정을 다시 불러왔습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenFrame screen={screen}>
      <AdminChatOperationsLayout>
        <div
          className="civic-admin-workbench civic-domain-console"
          data-wireflow-layout="room-category-admin"
        >
          <section className="civic-domain-form-section">
            <header>
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
              onDelete={setCategoryToDelete}
              onUpdate={(category, name) => void updateCategory(category, name)}
              pending={pending}
            />
            {loading ? <p aria-live="polite">최신 카테고리를 불러오는 중입니다.</p> : null}
          </section>

          <section className="civic-domain-form-section">
            <header>
              <h2>기존 토론방 카테고리 교체</h2>
            </header>
            <form
              className="civic-category-room-search console-toolbar"
              onSubmit={(event) => event.preventDefault()}
              role="search"
            >
              <ConsoleSearchControl
                ariaLabel="토론방 이름 검색"
                disabled={pending}
                maxLength={100}
                onChange={(value) => {
                  roomListGeneration.current += 1;
                  setRoomQuery(value);
                  setRoomNextCursor(null);
                  setRoomHasNext(false);
                  setRoomsLoading(true);
                }}
                placeholder="토론방 이름을 검색해 주세요."
                value={roomQuery}
              />
            </form>
            <ListedRoomTable
              categoryNamesById={categoryNamesById}
              items={visibleListedRooms}
              disabled={pending}
              loading={roomsLoading}
              onSelect={selectListedRoom}
              selectedRoomId={room?.roomId ?? null}
            />
            {roomHasNext && roomNextCursor ? (
              <button
                className="wf-button wf-button-secondary civic-load-more"
                disabled={roomsLoading || pending}
                onClick={() => void loadListedRooms(roomQuery.trim(), roomNextCursor, true)}
                type="button"
              >
                다음 토론방 불러오기
              </button>
            ) : null}
            {roomsLoading ? <p aria-live="polite">토론방 목록을 불러오는 중입니다.</p> : null}
            {roomListMessage ? (
              <p aria-live="polite" className="civic-form-message" role="status">
                {roomListMessage}
              </p>
            ) : null}
          </section>

          {message && !room ? (
            <p aria-live="polite" className="civic-form-message" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </AdminChatOperationsLayout>
      {room ? (
        <div className="civic-document-drawer-layer civic-category-editor-layer">
          <button
            aria-label="토론방 카테고리 편집 닫기"
            className="civic-document-drawer-scrim"
            onClick={closeRoomEditor}
            type="button"
          />
          <aside
            aria-labelledby="civic-category-editor-title"
            aria-modal="true"
            className="civic-document-inspector civic-category-editor"
            role="dialog"
          >
            <header>
              <div>
                <small>카테고리 편집</small>
                <strong id="civic-category-editor-title">{selectedRoomName}</strong>
              </div>
              <button
                aria-label="토론방 카테고리 편집 닫기"
                autoFocus
                onClick={closeRoomEditor}
                type="button"
              >
                ×
              </button>
            </header>
            <form
              className="civic-domain-action-panel civic-category-editor-form"
              onSubmit={replaceRoomCategories}
            >
              <p className="civic-boundary-copy">
                이 토론방에 표시할 카테고리를 최대 5개까지 선택하고 저장하세요.
              </p>
              <RoomCategorySelector
                categories={categories}
                disabled={pending}
                legend="적용할 카테고리"
                onChange={setSelectedCategoryIds}
                selectedCategoryIds={selectedCategoryIds}
              />
              {message ? (
                <p aria-live="polite" className="civic-form-message" role="status">
                  {message}
                </p>
              ) : null}
              <div className="civic-form-actions civic-category-editor-actions">
                <button
                  className="civic-secondary-action"
                  disabled={pending}
                  onClick={closeRoomEditor}
                  type="button"
                >
                  취소
                </button>
                <button className="civic-primary-action" disabled={pending} type="submit">
                  변경사항 저장
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
      <ConfirmDialog
        busy={pending}
        busyLabel="삭제 중…"
        cancelLabel="유지"
        confirmLabel="카테고리 삭제"
        description={`‘${categoryToDelete?.name ?? ""}’ 카테고리를 삭제합니다. 사용 중인 카테고리는 삭제할 수 없습니다.`}
        destructive
        onCancel={() => setCategoryToDelete(null)}
        onConfirm={() => void deleteCategory()}
        open={categoryToDelete !== null}
        title="카테고리를 삭제할까요?"
      />
    </ScreenFrame>
  );
}

function ListedRoomTable({
  categoryNamesById,
  disabled,
  items,
  loading,
  onSelect,
  selectedRoomId,
}: Readonly<{
  categoryNamesById: ReadonlyMap<string, string>;
  disabled: boolean;
  items: readonly ListedRoom[];
  loading: boolean;
  onSelect: (room: ListedRoom) => void;
  selectedRoomId: string | null;
}>) {
  return (
    <div aria-label="토론방 표" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table civic-listed-room-table">
        <thead>
          <tr>
            <th>토론방 이름</th>
            <th>현재 카테고리</th>
            <th>참여자</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4}>{loading ? "불러오는 중입니다." : "검색된 토론방이 없습니다."}</td>
            </tr>
          ) : null}
          {items.map((listedRoom) => {
            const selected = listedRoom.roomId === selectedRoomId;
            return (
              <tr className={selected ? "is-selected" : undefined} key={listedRoom.roomId}>
                <th scope="row">{listedRoom.name}</th>
                <td>
                  <div className="civic-listed-room-categories">
                    {listedRoom.categoryIds.map((categoryId) => (
                      <span key={categoryId}>
                        {categoryNamesById.get(categoryId) ?? "알 수 없는 카테고리"}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{listedRoom.activeMemberCount}명</td>
                <td>
                  <button
                    className="civic-secondary-action"
                    disabled={disabled || loading || selected}
                    onClick={() => onSelect(listedRoom)}
                    type="button"
                  >
                    수정
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 ? (
            <tr>
              <td colSpan={2}>등록된 카테고리가 없습니다.</td>
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

function mergeListedRooms(
  current: readonly ListedRoom[],
  incoming: readonly ListedRoom[],
): readonly ListedRoom[] {
  const merged = new Map(current.map((room) => [room.roomId, room]));
  for (const room of incoming) merged.set(room.roomId, room);
  return [...merged.values()];
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
