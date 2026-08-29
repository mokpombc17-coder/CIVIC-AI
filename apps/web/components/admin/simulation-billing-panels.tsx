"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readDailyUsage,
  readWalletSummary,
  type DailyUsage,
  type WalletSummary,
} from "@/lib/admin/simulation-billing-contracts";
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import {
  IdempotentMutationKeys,
  mutationFingerprint,
  toKoreanCalendarDate,
} from "@/lib/admin/simulation-billing-mutation";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type SimulationSection = "run" | "wallet" | "usage";

const sections: readonly Readonly<{ id: SimulationSection; label: string; href: Route }>[] = [
  { id: "run", label: "실행 관리", href: "/admin/simulations" as Route },
  {
    id: "wallet",
    label: "공용 지갑",
    href: "/admin/simulations?section=wallet" as Route,
  },
  { id: "usage", label: "사용량", href: "/admin/simulations?section=usage" as Route },
];

export function readSimulationSection(value: string | null): SimulationSection {
  return sections.some((item) => item.id === value) ? (value as SimulationSection) : "run";
}

export function SimulationSectionTabs({ active }: Readonly<{ active: SimulationSection }>) {
  return (
    <nav aria-label="시뮬레이션 관리자 메뉴" className="civic-simulation-section-tabs">
      {sections.map((section) => (
        <Link
          aria-current={section.id === active ? "page" : undefined}
          className="civic-simulation-section-tab"
          href={section.href}
          key={section.id}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

export function SimulationBillingSection({ section }: Readonly<{ section: SimulationSection }>) {
  if (section === "wallet") return <WalletPanel />;
  if (section === "usage") return <UsagePanel />;
  return null;
}

function WalletPanel() {
  const mutate = useIdempotentMutation();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [rawCode, setRawCode] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/v1/admin/simulation-billing/wallet", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
    const next = readWalletSummary(await response.json());
    if (!next) throw new Error("지갑 응답 형식을 확인해야 합니다.");
    setWallet(next);
  }, []);

  useInitialLoad(load, setMessage);

  async function redeemCoupon() {
    if (!rawCode.trim()) return setMessage("사용할 쿠폰 코드를 입력해 주세요.");
    setPending(true);
    try {
      const response = await mutate("/api/v1/admin/simulation-billing/coupons/redeem", {
        rawCode: rawCode.trim(),
      });
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      const next = readWalletSummary(await response.json());
      if (!next) return setMessage("쿠폰 사용 응답 형식을 확인해야 합니다.");
      setWallet(next);
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
      <section className="civic-simulation-summary-grid" aria-label="공용 지갑 요약">
        <Metric label="전체 잔액" value={formatKrw(wallet?.balanceKrw)} />
        <Metric label="실행 보류액" value={formatKrw(wallet?.heldKrw)} />
        <Metric label="사용 가능액" value={formatKrw(wallet?.availableKrw)} emphasis />
        <Metric label="오늘 사용액" value={formatKrw(wallet?.spentTodayKrw)} />
      </section>
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
    if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
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
          조회
        </button>
        <Link className="civic-secondary-action" href={exportHref} prefetch={false}>
          CSV 내려받기
        </Link>
      </div>
      <section className="civic-simulation-summary-grid" aria-label="사용량 합계">
        <Metric label="과금액" value={formatKrw(totals.charged)} emphasis />
        <Metric label="처리한 가상 패널" value={`${totals.personas.toLocaleString("ko-KR")}명`} />
        <Metric label="정산 행" value={`${rows.length.toLocaleString("ko-KR")}건`} />
      </section>
      <div className="civic-table-scroll" role="region" tabIndex={0} aria-label="시뮬레이션 사용량">
        <table className="civic-admin-table">
          <thead>
            <tr>
              <th>일자</th>
              <th>과업</th>
              <th>실행 관리자</th>
              <th>패널</th>
              <th>과금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.day}-${row.taskTitle}-${row.actorEmail}-${index}`}>
                <td>{row.day}</td>
                <th scope="row">{row.taskTitle}</th>
                <td>{row.actorEmail}</td>
                <td>{row.personaCount.toLocaleString("ko-KR")}명</td>
                <td>{formatKrw(row.chargedKrw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PanelMessage>{message}</PanelMessage>
    </div>
  );
}

function Metric({
  emphasis = false,
  label,
  value,
}: Readonly<{ emphasis?: boolean; label: string; value: string }>) {
  return (
    <article className={emphasis ? "is-emphasis" : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
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

function formatKrw(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")}원`;
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "정보를 불러오지 못했습니다.";
}
