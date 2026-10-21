"use client";

import { listCountLabel } from "@/lib/admin/list-count";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AdminChatOperationsLayout } from "@/components/admin/admin-chat-operations-layout";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { RoomCategorySelector } from "@/components/admin/room-category-selector";
import { ConsoleDataGrid, type ConsoleColumn } from "@/components/admin/console/console-data-grid";
import { ConsoleModal } from "@/components/admin/console/console-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  ConsolePane,
  ConsoleSearchControl,
  ConsoleStatus,
  ConsoleWorkspace,
} from "@/components/admin/console/console-ui";
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
  const [categoryToEdit, setCategoryToEdit] = useState<RoomCategory | null>(null);
  const [categoryEditName, setCategoryEditName] = useState("");
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

  async function updateCategory(category: RoomCategory, name: string): Promise<boolean> {
    const normalizedName = name.trim();
    if (!normalizedName || pending) return false;
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
        return false;
      }
      const updated = readRoomCategory(await response.json());
      if (!updated) {
        setMessage("서버의 카테고리 수정 응답 형식을 확인해야 합니다.");
        return false;
      }
      setCategories((current) =>
        sortRoomCategories(
          current.map((item) => (item.categoryId === updated.categoryId ? updated : item)),
        ),
      );
      setMessage("카테고리 이름을 저장했습니다.");
      return true;
    } catch {
      setMessage("네트워크 오류로 카테고리 이름을 저장하지 못했습니다.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function openCategoryEditor(category: RoomCategory) {
    setCategoryToEdit(category);
    setCategoryEditName(category.name);
    setMessage("");
  }

  function closeCategoryEditor() {
    setCategoryToEdit(null);
    setCategoryEditName("");
    setMessage("");
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
        <ConsoleWorkspace layout="room-category-admin-console">
          <ConsolePane
            ariaLabel="카테고리 목록"
            subtitle={listCountLabel({
              shown: categories.length,
              total: categories.length,
              unit: "개",
            })}
            title="카테고리 목록"
          >
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
            <CategoryGrid
              categories={categories}
              onDelete={setCategoryToDelete}
              onEdit={openCategoryEditor}
              pending={pending}
            />
            {loading ? <ConsoleStatus>최신 카테고리를 불러오는 중입니다.</ConsoleStatus> : null}
            {message && !room && !categoryToEdit ? (
              <ConsoleStatus error={message.includes("오류") || message.includes("못했습니다")}>
                {message}
              </ConsoleStatus>
            ) : null}
          </ConsolePane>

          <ConsolePane
            ariaLabel="토론방 카테고리 교체"
            subtitle={listCountLabel({ shown: visibleListedRooms.length, hasMore: roomHasNext })}
            title="토론방 카테고리 교체"
          >
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
            <ListedRoomGrid
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
                더 불러오기
              </button>
            ) : null}
            {roomsLoading ? <ConsoleStatus>토론방 목록을 불러오는 중입니다.</ConsoleStatus> : null}
            {roomListMessage ? (
              <p aria-live="polite" className="civic-form-message" role="status">
                {roomListMessage}
              </p>
            ) : null}
          </ConsolePane>
        </ConsoleWorkspace>
      </AdminChatOperationsLayout>
      <ConsoleModal ariaLabel="토론방 카테고리 편집" onClose={closeRoomEditor} open={room !== null}>
        <aside className="civic-document-inspector civic-category-editor">
          <header>
            <div>
              <small>카테고리 편집</small>
              <strong id="civic-category-editor-title">{selectedRoomName}</strong>
            </div>
            <button aria-label="토론방 카테고리 편집 닫기" onClick={closeRoomEditor} type="button">
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
      </ConsoleModal>
      <ConsoleModal
        ariaLabel="카테고리 이름 편집"
        onClose={closeCategoryEditor}
        open={categoryToEdit !== null}
      >
        <aside className="civic-document-inspector civic-category-editor">
          <header>
            <div>
              <small>카테고리 이름 수정</small>
              <strong>{categoryToEdit?.name ?? "카테고리"}</strong>
            </div>
            <button
              aria-label="카테고리 이름 편집 닫기"
              onClick={closeCategoryEditor}
              type="button"
            >
              ×
            </button>
          </header>
          <form
            className="civic-domain-action-panel civic-category-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!categoryToEdit) return;
              void updateCategory(categoryToEdit, categoryEditName).then((updated) => {
                if (updated) closeCategoryEditor();
              });
            }}
          >
            <label className="civic-field">
              <span>카테고리 이름</span>
              <input
                autoFocus
                disabled={pending}
                maxLength={50}
                onChange={(event) => setCategoryEditName(event.currentTarget.value)}
                required
                value={categoryEditName}
              />
            </label>
            {message ? <ConsoleStatus error>{message}</ConsoleStatus> : null}
            <div className="civic-form-actions civic-category-editor-actions">
              <button
                className="civic-secondary-action"
                disabled={pending}
                onClick={closeCategoryEditor}
                type="button"
              >
                취소
              </button>
              <button
                className="civic-primary-action"
                disabled={
                  pending ||
                  !categoryEditName.trim() ||
                  categoryEditName.trim() === categoryToEdit?.name
                }
                type="submit"
              >
                이름 저장
              </button>
            </div>
          </form>
        </aside>
      </ConsoleModal>
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

function ListedRoomGrid({
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
  const columns = useMemo<ReadonlyArray<ConsoleColumn<ListedRoom>>>(
    () => [
      { field: "name", headerName: "토론방", flex: 2, minWidth: 180 },
      {
        headerName: "현재 카테고리",
        flex: 2,
        minWidth: 180,
        valueGetter: (params) =>
          params.data
            ? params.data.categoryIds
                .map((categoryId) => categoryNamesById.get(categoryId) ?? "알 수 없는 카테고리")
                .join(", ") || "—"
            : "",
      },
      {
        headerName: "활성 참여자",
        minWidth: 110,
        valueGetter: (params) =>
          params.data ? `${params.data.activeMemberCount.toLocaleString("ko-KR")}명` : "",
      },
      {
        headerName: "작업",
        minWidth: 100,
        sortable: false,
        cellRenderer: (params: Readonly<{ data?: ListedRoom }>) =>
          params.data ? (
            <button
              className="civic-secondary-action civic-grid-row-action"
              disabled={disabled || loading || params.data.roomId === selectedRoomId}
              onClick={() => onSelect(params.data as ListedRoom)}
              type="button"
            >
              수정
            </button>
          ) : null,
      },
    ],
    [categoryNamesById, disabled, loading, onSelect, selectedRoomId],
  );
  return (
    <ConsoleDataGrid
      ariaLabel="토론방 카테고리 교체 표"
      columnDefs={columns}
      emptyText={loading ? "불러오는 중입니다." : "검색된 토론방이 없습니다."}
      getRowId={(listedRoom) => listedRoom.roomId}
      height={460}
      onRowClicked={onSelect}
      rowData={items}
      selectedRowId={selectedRoomId}
    />
  );
}

function CategoryGrid({
  categories,
  onDelete,
  onEdit,
  pending,
}: Readonly<{
  categories: readonly RoomCategory[];
  onDelete: (category: RoomCategory) => void;
  onEdit: (category: RoomCategory) => void;
  pending: boolean;
}>) {
  const columns = useMemo<ReadonlyArray<ConsoleColumn<RoomCategory>>>(
    () => [
      { field: "name", headerName: "카테고리", flex: 2, minWidth: 180 },
      {
        headerName: "구분",
        minWidth: 90,
        valueGetter: (params) =>
          params.data?.categoryId === DEFAULT_ROOM_CATEGORY_ID ? "기본" : "일반",
      },
      {
        headerName: "작업",
        minWidth: 190,
        sortable: false,
        cellRenderer: (params: Readonly<{ data?: RoomCategory }>) =>
          params.data ? (
            <div className="console-actions is-start civic-grid-row-actions">
              <button
                className="civic-secondary-action civic-grid-row-action"
                disabled={pending}
                onClick={() => onEdit(params.data as RoomCategory)}
                type="button"
              >
                이름 수정
              </button>
              <button
                className="civic-danger-action civic-grid-row-action"
                disabled={pending || params.data.categoryId === DEFAULT_ROOM_CATEGORY_ID}
                onClick={() => onDelete(params.data as RoomCategory)}
                title={
                  params.data.categoryId === DEFAULT_ROOM_CATEGORY_ID
                    ? "기본 정책 카테고리는 삭제할 수 없습니다."
                    : undefined
                }
                type="button"
              >
                삭제
              </button>
            </div>
          ) : null,
      },
    ],
    [onDelete, onEdit, pending],
  );
  return (
    <ConsoleDataGrid
      ariaLabel="카테고리 목록 표"
      columnDefs={columns}
      emptyText="등록된 카테고리가 없습니다."
      getRowId={(category) => category.categoryId}
      height={460}
      rowData={categories}
    />
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
