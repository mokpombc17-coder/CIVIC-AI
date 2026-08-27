"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  readBillingPolicies,
  readCouponIssue,
  readDailyUsage,
  readSimulationImportStatus,
  readWalletSummary,
  type BillingPolicies,
  type CouponIssue,
  type DailyUsage,
  type SimulationImportStatus,
  type WalletSummary,
} from "@/lib/admin/simulation-billing-contracts";
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type SimulationSection = "run" | "wallet" | "policies" | "usage" | "imports";

const sections: readonly Readonly<{ id: SimulationSection; label: string; href: Route }>[] = [
  { id: "run", label: "실행 관리", href: "/admin/simulations" as Route },
  {
    id: "wallet",
    label: "공용 지갑",
    href: "/admin/simulations?section=wallet" as Route,
  },
  {
    id: "policies",
    label: "가격 정책",
    href: "/admin/simulations?section=policies" as Route,
  },
  { id: "usage", label: "사용량", href: "/admin/simulations?section=usage" as Route },
  {
    id: "imports",
    label: "근거 이관",
    href: "/admin/simulations?section=imports" as Route,
  },
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
  if (section === "policies") return <PolicyPanel />;
  if (section === "usage") return <UsagePanel />;
  if (section === "imports") return <ImportPanel />;
  return null;
}

function WalletPanel() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [issued, setIssued] = useState<CouponIssue | null>(null);
  const [amount, setAmount] = useState("10000");
  const [reason, setReason] = useState("공용 시뮬레이션 예산 충전");
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

  async function issueCoupon() {
    const amountKrw = Number(amount);
    if (!Number.isSafeInteger(amountKrw) || amountKrw <= 0 || amountKrw % 1000 !== 0) {
      return setMessage("쿠폰 금액은 1,000원 단위의 양수로 입력해 주세요.");
    }
    setPending(true);
    setIssued(null);
    try {
      const response = await mutate("/api/v1/admin/simulation-billing/coupons", {
        amountKrw,
        reason,
      });
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      const coupon = readCouponIssue(await response.json());
      if (!coupon) return setMessage("쿠폰 발급 응답 형식을 확인해야 합니다.");
      setIssued(coupon);
      setMessage("쿠폰을 발급했습니다. 원문 코드는 이 화면을 벗어나면 다시 표시되지 않습니다.");
    } catch {
      setMessage("네트워크 오류로 쿠폰을 발급하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

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
      <div className="civic-simulation-two-column">
        <section className="civic-domain-form-section">
          <header>
            <span>관리자 발급</span>
            <h2>원화 쿠폰 만들기</h2>
          </header>
          <label className="civic-field">
            <span>금액</span>
            <input
              min="1000"
              onChange={(event) => setAmount(event.currentTarget.value)}
              step="1000"
              type="number"
              value={amount}
            />
          </label>
          <label className="civic-field">
            <span>발급 사유</span>
            <input
              maxLength={500}
              onChange={(event) => setReason(event.currentTarget.value)}
              value={reason}
            />
          </label>
          <button
            className="civic-primary-action"
            disabled={pending || !reason.trim()}
            onClick={() => void issueCoupon()}
            type="button"
          >
            쿠폰 발급
          </button>
          {issued ? (
            <div className="civic-simulation-secret" role="status">
              <strong>{issued.amountKrw.toLocaleString("ko-KR")}원 쿠폰</strong>
              <code>{issued.rawCode}</code>
              <p>원문은 서버에 저장되지 않습니다. 전달하기 전에 안전한 곳에 복사해 주세요.</p>
            </div>
          ) : null}
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
      </div>
      <PanelMessage>{message}</PanelMessage>
    </div>
  );
}

function PolicyPanel() {
  const [policies, setPolicies] = useState<BillingPolicies | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [fx, setFx] = useState("1350");
  const [provider, setProvider] = useState({
    input: "3",
    output: "15",
    cacheRead: "0.3",
    cacheWrite: "3.75",
    reasoning: "15",
  });
  const [model, setModel] = useState({ multiplier: "4", average: "0.05" });

  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/v1/admin/simulation-billing/policies", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
    const next = readBillingPolicies(await response.json());
    if (!next) throw new Error("가격 정책 응답 형식을 확인해야 합니다.");
    setPolicies(next);
  }, []);
  useInitialLoad(load, setMessage);

  async function createDraft(kind: "fx" | "provider-prices" | "model-prices") {
    setPending(true);
    const sourceLabel = `관리자 입력 ${new Date().toLocaleDateString("ko-KR")}`;
    const payload =
      kind === "fx"
        ? { usdToKrw: fx, sourceLabel, sourceEffectiveAt: new Date().toISOString() }
        : kind === "provider-prices"
          ? {
              sourceLabel,
              items: [
                {
                  provider: "openrouter",
                  exactModelId: "anthropic/claude-sonnet-4.6",
                  inputUsdPerMillion: provider.input,
                  outputUsdPerMillion: provider.output,
                  cacheReadUsdPerMillion: provider.cacheRead,
                  cacheWriteUsdPerMillion: provider.cacheWrite,
                  reasoningUsdPerMillion: provider.reasoning,
                },
              ],
            }
          : {
              globalMultiplier: model.multiplier,
              sourceLabel,
              items: [
                {
                  exactModelId: "claude-sonnet-4-6",
                  modelMultiplier: model.multiplier,
                  initialAverageUsd: model.average,
                },
              ],
            };
    try {
      const response = await mutate(
        `/api/v1/admin/simulation-billing/policies/${kind}/drafts`,
        payload,
      );
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      await load();
      setMessage("초안 정책을 만들었습니다. 검토 후 활성화해 주세요.");
    } catch {
      setMessage("네트워크 오류로 정책 초안을 만들지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function activate(kind: "fx" | "provider-prices" | "model-prices", version: number) {
    setPending(true);
    try {
      const response = await mutate(
        `/api/v1/admin/simulation-billing/policies/${kind}/${version}/activate`,
      );
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      await load();
      setMessage(`v${version} 정책을 활성화했습니다.`);
    } catch {
      setMessage("네트워크 오류로 정책을 활성화하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="civic-simulation-billing-stack">
      <section className="civic-simulation-summary-grid" aria-label="활성 가격 정책">
        <Metric
          label="적용 환율"
          value={
            policies
              ? `1 USD = ${Number(policies.activeFx.usdToKrw).toLocaleString("ko-KR")}원`
              : "-"
          }
          emphasis
        />
        <Metric
          label="공급자 단가 버전"
          value={policies ? `v${policies.activeProviderPrices.versionNumber}` : "-"}
        />
        <Metric
          label="모델 가격 버전"
          value={policies ? `v${policies.activeModelPrices.versionNumber}` : "-"}
        />
        <Metric
          label="전역 배율"
          value={policies ? `× ${policies.activeModelPrices.globalMultiplier}` : "-"}
        />
      </section>
      <div className="civic-simulation-policy-grid">
        <PolicyEditor
          title="USD/KRW 환율"
          subtitle="외부 비용을 원화로 환산"
          onCreate={() => void createDraft("fx")}
          pending={pending}
        >
          <DecimalField label="1 USD 당 원화" value={fx} onChange={setFx} />
        </PolicyEditor>
        <PolicyEditor
          title="OpenRouter 공급자 단가"
          subtitle="백만 토큰당 USD"
          onCreate={() => void createDraft("provider-prices")}
          pending={pending}
        >
          <DecimalField
            label="입력"
            value={provider.input}
            onChange={(value) => setProvider((current) => ({ ...current, input: value }))}
          />
          <DecimalField
            label="출력"
            value={provider.output}
            onChange={(value) => setProvider((current) => ({ ...current, output: value }))}
          />
          <DecimalField
            label="캐시 읽기"
            value={provider.cacheRead}
            onChange={(value) => setProvider((current) => ({ ...current, cacheRead: value }))}
          />
          <DecimalField
            label="캐시 쓰기"
            value={provider.cacheWrite}
            onChange={(value) => setProvider((current) => ({ ...current, cacheWrite: value }))}
          />
          <DecimalField
            label="추론"
            value={provider.reasoning}
            onChange={(value) => setProvider((current) => ({ ...current, reasoning: value }))}
          />
        </PolicyEditor>
        <PolicyEditor
          title="SONA 모델 가격"
          subtitle="예상 비용 배율과 초기 평균"
          onCreate={() => void createDraft("model-prices")}
          pending={pending}
        >
          <DecimalField
            label="모델 배율"
            value={model.multiplier}
            onChange={(value) => setModel((current) => ({ ...current, multiplier: value }))}
          />
          <DecimalField
            label="1인 초기 평균 USD"
            value={model.average}
            onChange={(value) => setModel((current) => ({ ...current, average: value }))}
          />
        </PolicyEditor>
      </div>
      <section className="civic-domain-form-section">
        <header>
          <span>버전 이력</span>
          <h2>초안 검토 및 활성화</h2>
        </header>
        <div className="civic-table-scroll" role="region" tabIndex={0} aria-label="가격 정책 버전">
          <table className="civic-admin-table">
            <thead>
              <tr>
                <th>정책</th>
                <th>버전</th>
                <th>상태</th>
                <th>근거</th>
                <th>등록자</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {policyRows(policies).map((row) => (
                <tr key={`${row.kind}-${row.version}`}>
                  <th scope="row">{row.label}</th>
                  <td>v{row.version}</td>
                  <td>{policyStatusLabel(row.status)}</td>
                  <td>{row.source}</td>
                  <td>{row.actor}</td>
                  <td>
                    {row.status === "DRAFT" ? (
                      <button
                        className="civic-secondary-action"
                        disabled={pending}
                        onClick={() => void activate(row.kind, row.version)}
                        type="button"
                      >
                        활성화
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PanelMessage>{message}</PanelMessage>
    </div>
  );
}

function UsagePanel() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
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
      absorbed: sum.absorbed + row.absorbedKrw,
      personas: sum.personas + row.personaCount,
    }),
    { charged: 0, absorbed: 0, personas: 0 },
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
        <Metric label="서비스 부담액" value={formatKrw(totals.absorbed)} />
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
              <th>모델</th>
              <th>패널</th>
              <th>공급자 비용</th>
              <th>과금액</th>
              <th>부담액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.day}-${row.taskTitle}-${row.actorEmail}-${index}`}>
                <td>{row.day}</td>
                <th scope="row">{row.taskTitle}</th>
                <td>{row.actorEmail}</td>
                <td>{row.model}</td>
                <td>{row.personaCount.toLocaleString("ko-KR")}명</td>
                <td>${Number(row.providerCostUsd).toFixed(4)}</td>
                <td>{formatKrw(row.chargedKrw)}</td>
                <td>{formatKrw(row.absorbedKrw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PanelMessage>{message}</PanelMessage>
    </div>
  );
}

function ImportPanel() {
  const [status, setStatus] = useState<SimulationImportStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/v1/admin/simulation-billing/imports/latest", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
    const payload: unknown = await response.json();
    const next = readSimulationImportStatus(payload);
    if (payload !== null && !next) throw new Error("이관 상태 응답 형식을 확인해야 합니다.");
    setStatus(next);
    setLoaded(true);
  }, []);
  useInitialLoad(load, setMessage);
  return (
    <div className="civic-simulation-billing-stack">
      <section className="civic-domain-form-section">
        <header>
          <span>SONA 기준 데이터</span>
          <h2>최근 근거 이관 상태</h2>
        </header>
        {status ? (
          <>
            <section className="civic-simulation-summary-grid">
              <Metric label="상태" value={importStatusLabel(status.status)} emphasis />
              <Metric label="원본 버전" value={status.sourceCommit.slice(0, 12)} />
              <Metric label="시작" value={formatDate(status.startedAt)} />
              <Metric label="완료" value={formatDate(status.completedAt)} />
            </section>
            <dl className="civic-domain-impact-list">
              <div>
                <dt>원본 스키마</dt>
                <dd>{status.sourceSchema}</dd>
              </div>
              <div>
                <dt>이관 관리자</dt>
                <dd>{status.importedByEmail}</dd>
              </div>
              {Object.entries(status.rowCounts).map(([key, count]) => (
                <div key={key}>
                  <dt>{importRowLabel(key)}</dt>
                  <dd>{count.toLocaleString("ko-KR")}건</dd>
                </div>
              ))}
            </dl>
          </>
        ) : loaded ? (
          <p className="civic-domain-empty">아직 이관 실행 기록이 없습니다.</p>
        ) : null}
        <p className="civic-simulation-copy">
          이관 명령은 운영자가 읽기 전용 SONA 연결로 실행합니다. 이 화면은 환율·모델 단가·완료된
          익명 비용/시간 근거만 확인하며 기존 지갑·쿠폰·정산 데이터는 가져오지 않습니다.
        </p>
        <button
          className="civic-secondary-action"
          onClick={() => void load().catch((error: unknown) => setMessage(messageOf(error)))}
          type="button"
        >
          상태 새로고침
        </button>
      </section>
      <PanelMessage>{message}</PanelMessage>
    </div>
  );
}

function PolicyEditor({
  children,
  onCreate,
  pending,
  subtitle,
  title,
}: Readonly<{
  children: ReactNode;
  onCreate: () => void;
  pending: boolean;
  subtitle: string;
  title: string;
}>) {
  return (
    <section className="civic-domain-form-section">
      <header>
        <span>{subtitle}</span>
        <h2>{title}</h2>
      </header>
      <div className="civic-simulation-compact-fields">{children}</div>
      <button className="civic-primary-action" disabled={pending} onClick={onCreate} type="button">
        초안 만들기
      </button>
    </section>
  );
}

function DecimalField({
  label,
  onChange,
  value,
}: Readonly<{ label: string; onChange: (value: string) => void; value: string }>) {
  return (
    <label className="civic-field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        onChange={(event) => onChange(event.currentTarget.value)}
        required
        value={value}
      />
    </label>
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

async function mutate(path: string, body?: unknown): Promise<Response> {
  return authenticatedFetch(path, {
    method: "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "idempotency-key": window.crypto.randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function policyRows(policies: BillingPolicies | null) {
  if (!policies) return [];
  return [
    ...policies.fx.map((item) => ({
      kind: "fx" as const,
      label: "환율",
      version: item.versionNumber,
      status: item.status,
      source: item.sourceLabel,
      actor: item.createdByEmail,
    })),
    ...policies.providerPrices.map((item) => ({
      kind: "provider-prices" as const,
      label: "공급자 단가",
      version: item.versionNumber,
      status: item.status,
      source: item.sourceLabel,
      actor: item.createdByEmail,
    })),
    ...policies.modelPrices.map((item) => ({
      kind: "model-prices" as const,
      label: "모델 가격",
      version: item.versionNumber,
      status: item.status,
      source: item.sourceLabel,
      actor: item.createdByEmail,
    })),
  ];
}

function formatKrw(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")}원`;
}
function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ko-KR");
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "정보를 불러오지 못했습니다.";
}
function policyStatusLabel(status: "DRAFT" | "ACTIVE" | "RETIRED"): string {
  return { DRAFT: "초안", ACTIVE: "사용 중", RETIRED: "종료" }[status];
}
function importStatusLabel(status: SimulationImportStatus["status"]): string {
  return { RUNNING: "진행 중", COMPLETED: "완료", FAILED: "실패" }[status];
}
function importRowLabel(key: string): string {
  return (
    {
      fx: "환율",
      providerPrices: "공급자 단가",
      modelPrices: "모델 가격",
      costSamples: "비용 표본",
      etaSamples: "시간 표본",
    }[key] ?? key
  );
}
