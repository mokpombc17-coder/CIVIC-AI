"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConsoleDataGrid, type ConsoleColumn } from "@/components/admin/console/console-data-grid";
import { ConsoleMetricStrip, type ConsoleMetricItem } from "@/components/admin/console/console-ui";
import { formatKrw } from "@/lib/admin/format";
import {
  readDailyUsage,
  readWalletSummary,
  type DailyUsage,
  type WalletSummary,
} from "@/lib/admin/simulation-billing-contracts";
import { formatSimulationProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import { errorMessage } from "@/lib/user-facing-message";
import {
  IdempotentMutationKeys,
  mutationFingerprint,
  toKoreanCalendarDate,
} from "@/lib/admin/simulation-billing-mutation";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type SimulationSection = "run" | "wallet" | "usage";

const sections: readonly Readonly<{ id: SimulationSection; label: string; href: Route }>[] = [
  { id: "run", label: "시뮬레이션 목록", href: "/admin/simulations" as Route },
  { id: "usage", label: "사용 내역", href: "/admin/simulations?section=usage" as Route },
  {
    id: "wallet",
    label: "등록",
    href: "/admin/simulations?section=wallet" as Route,
  },
];

export function readSimulationSection(value: string | null): SimulationSection {
  return sections.some((item) => item.id === value) ? (value as SimulationSection) : "run";
}

export function SimulationSectionTabs({
  active,
  onSelect,
}: Readonly<{ active: SimulationSection; onSelect?: (section: SimulationSection) => void }>) {
  return (
    <nav aria-label="시뮬레이션 관리자 메뉴" className="civic-simulation-section-tabs">
      {sections.map((section) => (
        <Link
          aria-current={section.id === active ? "page" : undefined}
          className="civic-simulation-section-tab"
          href={section.href}
          key={section.id}
          {...(onSelect
            ? {
                onClick: (event: { preventDefault: () => void }) => {
                  event.preventDefault();
                  onSelect(section.id);
                },
              }
            : {})}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

export type WalletMetricState =
  | { status: "loading" }
  | { status: "ready"; wallet: WalletSummary }
  | { status: "unavailable" }
  | { status: "forbidden" };

export async function loadWalletMetricState(
  request: typeof fetch = authenticatedFetch,
): Promise<WalletMetricState> {
  try {
    const response = await request("/api/v1/admin/simulation-billing/wallet", {
      cache: "no-store",
    });
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const wallet = readWalletSummary(await response.json());
    return wallet ? { status: "ready", wallet } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function walletMetricItems(state: WalletMetricState): readonly ConsoleMetricItem[] {
  const value = (read: (wallet: WalletSummary) => string): string => {
    if (state.status === "ready") return read(state.wallet);
    if (state.status === "forbidden") return "권한 없음";
    return state.status === "loading" ? "확인 중" : "확인 불가";
  };
  return [
    { label: "전체 잔액", value: value((wallet) => formatKrw(wallet.balanceKrw)) },
    { label: "실행 보류액", value: value((wallet) => formatKrw(wallet.heldKrw)) },
    { label: "사용 가능액", value: value((wallet) => formatKrw(wallet.availableKrw)) },
    { label: "오늘 사용액", value: value((wallet) => formatKrw(wallet.spentTodayKrw)) },
  ];
}

export function SimulationBillingSection({
  section,
  onWalletChange,
}: Readonly<{ section: SimulationSection; onWalletChange?: (wallet: WalletSummary) => void }>) {
  if (section === "wallet") return <WalletPanel onWalletChange={onWalletChange} />;
  if (section === "usage") return <UsagePanel />;
  return null;
}

function WalletPanel({
  onWalletChange,
}: Readonly<{ onWalletChange?: ((wallet: WalletSummary) => void) | undefined }>) {
  const mutate = useIdempotentMutation();
  const [rawCode, setRawCode] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/v1/admin/simulation-billing/wallet", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(formatSimulationProblem(await readAdminProblem(response)));
    const next = readWalletSummary(await response.json());
    if (!next) throw new Error("지갑 응답 형식을 확인해야 합니다.");
    onWalletChange?.(next);
  }, [onWalletChange]);

  async function redeemCoupon() {
    if (!rawCode.trim()) return setMessage("사용할 쿠폰 코드를 입력해 주세요.");
    setPending(true);
    try {
      const response = await mutate("/api/v1/admin/simulation-billing/coupons/redeem", {
        rawCode: rawCode.trim(),
      });
      if (!response.ok)
        return setMessage(formatSimulationProblem(await readAdminProblem(response)));
      const next = readWalletSummary(await response.json());
      if (!next) return setMessage("쿠폰 사용 응답 형식을 확인해야 합니다.");
      onWalletChange?.(next);
      setRawCode("");
      setMessage("쿠폰 금액을 공용 지갑에 반영했습니다.");
    } catch {
      setMessage("네트워크 오류로 쿠폰을 사용하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="civic-simulation-billing-stack">
      <section className="civic-domain-form-section">
        <header>
          <span>공용 예산 반영</span>
          <h2>쿠폰 사용</h2>
        </header>
        <label className="civic-field">
          <span>쿠폰 코드</span>
          <input
            autoComplete="off"
            onChange={(event) => setRawCode(event.currentTarget.value)}
            spellCheck={false}
            value={rawCode}
          />
        </label>
        <button
          className="civic-primary-action"
          disabled={pending || !rawCode.trim()}
          onClick={() => void redeemCoupon()}
          type="button"
        >
          지갑에 반영
        </button>
        <button
          className="civic-secondary-action"
          disabled={pending}
          onClick={() => void load().catch((error: unknown) => setMessage(messageOf(error)))}
          type="button"
        >
          잔액 새로고침
        </button>
      </section>
      <PanelMessage>{message}</PanelMessage>
    </div>
  );
}

export type UsageGridRow = Readonly<{
  rowId: string;
  day: string;
  taskTitle: string;
  actorEmail: string;
  personaLabel: string;
  chargedLabel: string;
}>;

export const USAGE_GRID_COLUMNS: ReadonlyArray<ConsoleColumn<UsageGridRow>> = [
  { field: "day", headerName: "일자", minWidth: 110 },
  { field: "taskTitle", headerName: "투표", flex: 2, minWidth: 160 },
  { field: "actorEmail", headerName: "실행 관리자", flex: 2, minWidth: 160 },
  { field: "personaLabel", headerName: "페르소나", minWidth: 90 },
  { field: "chargedLabel", headerName: "과금액", minWidth: 110 },
];

export function usageGridRows(rows: readonly DailyUsage[]): readonly UsageGridRow[] {
  return rows.map((row, index) => ({
    rowId: `${row.day}-${row.taskTitle}-${row.actorEmail}-${index}`,
    day: row.day,
    taskTitle: row.taskTitle,
    actorEmail: row.actorEmail,
    personaLabel: `${row.personaCount.toLocaleString("ko-KR")}명`,
    chargedLabel: formatKrw(row.chargedKrw),
  }));
}

function UsagePanel() {
  const today = useMemo(() => toKoreanCalendarDate(new Date()), []);
  const monthStart = useMemo(() => `${today.slice(0, 8)}01`, [today]);
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [rows, setRows] = useState<readonly DailyUsage[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const query = new URLSearchParams({ start, end });
    const response = await authenticatedFetch(
      `/api/v1/admin/simulation-billing/reports/daily?${query.toString()}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(formatSimulationProblem(await readAdminProblem(response)));
    const next = readDailyUsage(await response.json());
    if (!next) throw new Error("사용량 응답 형식을 확인해야 합니다.");
    setRows(next);
    setMessage(next.length === 0 ? "선택한 기간에 정산된 사용량이 없습니다." : "");
  }, [end, start]);
  useInitialLoad(load, setMessage);
  const totals = rows.reduce(
    (sum, row) => ({
      charged: sum.charged + row.chargedKrw,
      personas: sum.personas + row.personaCount,
    }),
    { charged: 0, personas: 0 },
  );
  const exportHref =
    `/api/v1/admin/simulation-billing/reports/daily.csv?${new URLSearchParams({ start, end }).toString()}` as Route;

  return (
    <div className="civic-simulation-billing-stack">
      <div className="civic-domain-toolbar civic-simulation-usage-filter">
        <label className="civic-field">
          <span>시작일</span>
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.currentTarget.value)}
          />
        </label>
        <label className="civic-field">
          <span>종료일</span>
          <input type="date" value={end} onChange={(event) => setEnd(event.currentTarget.value)} />
        </label>
        <button
          className="civic-primary-action"
          onClick={() => void load().catch((error: unknown) => setMessage(messageOf(error)))}
          type="button"
        >
          확인
        </button>
        <Link className="civic-secondary-action" href={exportHref} prefetch={false}>
          CSV 다운로드
        </Link>
      </div>
      <ConsoleMetricStrip
        ariaLabel="사용량 합계"
        metrics={[
          { label: "과금액", value: formatKrw(totals.charged) },
          { label: "사용한 페르소나", value: `${totals.personas.toLocaleString("ko-KR")}명` },
          { label: "정산 내역", value: `${rows.length.toLocaleString("ko-KR")}건` },
        ]}
      />
      <ConsoleDataGrid
        ariaLabel="시뮬레이션 사용량"
        columnDefs={USAGE_GRID_COLUMNS}
        emptyText="선택한 기간에 정산된 사용량이 없습니다."
        getRowId={(row) => row.rowId}
        height={420}
        rowData={usageGridRows(rows)}
      />
      <PanelMessage>{message}</PanelMessage>
    </div>
  );
}

function PanelMessage({ children }: Readonly<{ children: string }>) {
  return children ? (
    <p aria-live="polite" className="civic-domain-empty" role="status">
      {children}
    </p>
  ) : null;
}

function useInitialLoad(load: () => Promise<void>, setMessage: (value: string) => void) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch((error: unknown) => setMessage(messageOf(error))),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load, setMessage]);
}

function useIdempotentMutation() {
  const keys = useRef<IdempotentMutationKeys | null>(null);
  keys.current ??= new IdempotentMutationKeys();
  return useCallback(async (path: string, body?: unknown): Promise<Response> => {
    const fingerprint = mutationFingerprint(path, body);
    const response = await authenticatedFetch(path, {
      method: "POST",
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        "idempotency-key": keys.current!.keyFor(fingerprint),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    keys.current!.resolve(fingerprint);
    return response;
  }, []);
}

function messageOf(error: unknown): string {
  return errorMessage(error, "정보를 불러오지 못했습니다.");
}
