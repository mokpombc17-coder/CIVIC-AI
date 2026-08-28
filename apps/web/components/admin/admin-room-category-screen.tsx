"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { RoomCategorySelector } from "@/components/admin/room-category-selector";
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
  const [activeRoomQuery, setActiveRoomQuery] = useState("");
  const [roomNextCursor, setRoomNextCursor] = useState<string | null>(null);
  const [roomHasNext, setRoomHasNext] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<RoomDetailCategorySnapshot | null>(null);
  const [selectedRoomName, setSelectedRoomName] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [roomListMessage, setRoomListMessage] = useState("");

  const categoryNamesById = useMemo(
    () => new Map(categories.map((category) => [category.categoryId, category.name])),
    [categories],
  );

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
        if (!response.ok) {
          if (!append) setListedRooms([]);
          setRoomListMessage(formatAdminProblem(await readAdminProblem(response)));
          return;
        }
        const page = readListedRoomPage(await response.json());
        if (!page) {
          if (!append) setListedRooms([]);
          setRoomListMessage("서버의 채팅방 목록 응답 형식을 확인해야 합니다.");
          return;
        }
        setListedRooms((current) => (append ? mergeListedRooms(current, page.items) : page.items));
        setRoomNextCursor(page.nextCursor);
        setRoomHasNext(page.hasNext);
      } catch {
        if (!append) setListedRooms([]);
        setRoomListMessage("네트워크 오류로 채팅방 목록을 불러오지 못했습니다.");
      } finally {
        setRoomsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => void Promise.all([loadCategories(), loadListedRooms()]),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [loadCategories, loadListedRooms]);

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

  function searchRooms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (roomsLoading) return;
    const query = roomQuery.trim();
    setActiveRoomQuery(query);
    void loadListedRooms(query);
  }

  function selectListedRoom(selected: ListedRoom) {
    setRoomId(selected.roomId);
    setRoom({
      roomId: selected.roomId,
      categoryIds: selected.categoryIds,
      version: selected.version,
    });
    setSelectedRoomName(selected.name);
    setSelectedCategoryIds(selected.categoryIds);
    setMessage("채팅방을 선택했습니다. 카테고리를 확인한 뒤 저장해 주세요.");
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
        setMessage("서버의 채팅방 응답 형식을 확인해야 합니다.");
        return;
      }
      setRoom(snapshot);
      setRoomId(snapshot.roomId);
      setSelectedRoomName(
        listedRooms.find((listedRoom) => listedRoom.roomId === snapshot.roomId)?.name ?? "",
      );
      setSelectedCategoryIds(snapshot.categoryIds);
      setMessage("현재 카테고리 설정을 불러왔습니다.");
    } catch {
      setRoom(null);
      setSelectedRoomName("");
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
            <span>ACTIVE · LISTED ROOMS</span>
            <h2>기존 채팅방 카테고리 교체</h2>
          </header>
          <p className="civic-boundary-copy">
            일반 채팅방 목록에서 현재 공개 중인 방을 검색하고 카테고리를 변경할 수 있습니다.
          </p>
          <form className="civic-category-room-search" onSubmit={searchRooms}>
            <label className="civic-field">
              <span>채팅방 이름 검색</span>
              <input
                disabled={roomsLoading || pending}
                maxLength={100}
                onChange={(event) => setRoomQuery(event.currentTarget.value)}
                placeholder="검색어 입력…"
                type="search"
                value={roomQuery}
              />
            </label>
            <button
              className="civic-primary-action"
              disabled={roomsLoading || pending}
              type="submit"
            >
              검색
            </button>
          </form>
          <ListedRoomTable
            categoryNamesById={categoryNamesById}
            items={listedRooms}
            disabled={pending}
            loading={roomsLoading}
            onSelect={selectListedRoom}
            selectedRoomId={room?.roomId ?? null}
          />
          {roomHasNext && roomNextCursor ? (
            <button
              className="wf-button wf-button-secondary civic-load-more"
              disabled={roomsLoading || pending}
              onClick={() => void loadListedRooms(activeRoomQuery, roomNextCursor, true)}
              type="button"
            >
              다음 채팅방 불러오기
            </button>
          ) : null}
          {roomsLoading ? <p aria-live="polite">채팅방 목록을 불러오는 중입니다.</p> : null}
          {roomListMessage ? (
            <p aria-live="polite" className="civic-form-message" role="status">
              {roomListMessage}
            </p>
          ) : null}
          <details className="civic-category-room-fallback">
            <summary>목록에 없는 방 ID로 찾기</summary>
            <p className="civic-boundary-copy">
              비공개 또는 목록 비공개 방은 이미 알고 있는 채팅방 ID로 조회할 수 있습니다.
            </p>
            <div className="civic-category-room-lookup">
              <label className="civic-field">
                <span>채팅방 ID</span>
                <input
                  disabled={pending}
                  onChange={(event) => {
                    setRoomId(event.currentTarget.value);
                    if (event.currentTarget.value !== room?.roomId) {
                      setRoom(null);
                      setSelectedRoomName("");
                    }
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
          </details>
          {room ? (
            <form className="civic-domain-action-panel" onSubmit={replaceRoomCategories}>
              <p className="civic-selected-room">
                <strong>선택한 채팅방</strong>
                <span>{selectedRoomName || "ID로 조회한 채팅방"}</span>
              </p>
              <RoomCategorySelector
                categories={categories}
                disabled={pending}
                legend="교체할 카테고리"
                onChange={setSelectedCategoryIds}
                selectedCategoryIds={selectedCategoryIds}
              />
              <small>현재 버전: {room.version}</small>
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
    <div aria-label="공개 채팅방 표" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table civic-listed-room-table">
        <thead>
          <tr>
            <th>채팅방 이름</th>
            <th>현재 카테고리</th>
            <th>참여자</th>
            <th>버전</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5}>{loading ? "불러오는 중입니다." : "검색된 채팅방이 없습니다."}</td>
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
                <td>{listedRoom.version}</td>
                <td>
                  <button
                    className="civic-secondary-action"
                    disabled={disabled || loading || selected}
                    onClick={() => onSelect(listedRoom)}
                    type="button"
                  >
                    {selected ? "선택됨" : "선택"}
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
