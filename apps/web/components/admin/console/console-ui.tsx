"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRef, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";

// Presentational primitives for the unified admin console. Every /admin
// workspace composes these so list + detail density and spacing stay
// consistent across domains.

export function ConsoleWorkspace({
  children,
  single = false,
  layout,
}: Readonly<{ children: ReactNode; single?: boolean; layout?: string }>) {
  return (
    <div
      className={`console-workspace${single ? " is-single" : ""}`}
      {...(layout ? { "data-wireflow-layout": layout } : {})}
    >
      {children}
    </div>
  );
}

export function ConsolePane({
  title,
  subtitle,
  action,
  children,
  ariaLabel,
}: Readonly<{
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
}>) {
  return (
    <section className="console-pane" {...(ariaLabel ? { "aria-label": ariaLabel } : {})}>
      <header className="console-pane-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        {action ?? null}
      </header>
      <div className="console-pane-body">{children}</div>
    </section>
  );
}

export type ConsoleTabItem = Readonly<{ id: string; label: string; disabled?: boolean }>;

export function ConsoleTabs({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  idPrefix,
}: Readonly<{
  tabs: readonly ConsoleTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  /** 지정하면 `${idPrefix}-tab-{id}` / `${idPrefix}-panel-{id}`로 tabpanel과 연결된다. */
  idPrefix?: string;
}>) {
  const listRef = useRef<HTMLDivElement>(null);
  const focusableId = tabs.some((tab) => tab.id === activeId && !tab.disabled)
    ? activeId
    : tabs.find((tab) => !tab.disabled)?.id;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const enabled = tabs.filter((tab) => !tab.disabled);
    if (enabled.length === 0) return;
    const currentIndex = Math.max(
      0,
      enabled.findIndex((tab) => tab.id === activeId),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) %
            enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-console-tab="${CSS.escape(next.id)}"]`)
      ?.focus();
  }

  return (
    <div
      aria-label={ariaLabel}
      className="console-tabs"
      onKeyDown={handleKeyDown}
      ref={listRef}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          aria-selected={tab.id === activeId}
          className="console-tab"
          data-console-tab={tab.id}
          disabled={tab.disabled}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          role="tab"
          tabIndex={tab.id === focusableId ? 0 : -1}
          type="button"
          {...(idPrefix
            ? { "aria-controls": `${idPrefix}-panel-${tab.id}`, id: `${idPrefix}-tab-${tab.id}` }
            : {})}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ConsoleTabPanel({
  idPrefix,
  tabId,
  children,
}: Readonly<{ idPrefix: string; tabId: string; children: ReactNode }>) {
  return (
    <div
      aria-labelledby={`${idPrefix}-tab-${tabId}`}
      id={`${idPrefix}-panel-${tabId}`}
      role="tabpanel"
    >
      {children}
    </div>
  );
}

export type ConsoleMetricItem = Readonly<{
  label: string;
  value: string;
  description?: ReactNode;
  alert?: boolean;
  /** 지정하면 메트릭 카드 전체가 해당 화면으로 이동하는 링크가 된다. */
  href?: Route;
}>;

export function ConsoleMetricStrip({
  metrics,
  ariaLabel,
}: Readonly<{ metrics: readonly ConsoleMetricItem[]; ariaLabel: string }>) {
  return (
    <ul aria-label={ariaLabel} className="console-metrics">
      {metrics.map((metric) => {
        const body = (
          <>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            {metric.description ? <span>{metric.description}</span> : null}
          </>
        );
        return (
          <li className={`console-metric${metric.alert ? " is-alert" : ""}`} key={metric.label}>
            {metric.href ? (
              <Link className="civic-admin-metric-link" href={metric.href}>
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ConsoleEmpty({
  title,
  children,
}: Readonly<{ title: string; children?: ReactNode }>) {
  return (
    <div className="console-empty">
      <strong>{title}</strong>
      {children ?? null}
    </div>
  );
}

export function ConsoleBadge({
  tone = "neutral",
  children,
}: Readonly<{ tone?: "neutral" | "active" | "danger" | "success"; children: ReactNode }>) {
  const toneClass =
    tone === "active"
      ? " is-active"
      : tone === "danger"
        ? " is-danger"
        : tone === "success"
          ? " is-success"
          : "";
  return <span className={`console-badge${toneClass}`}>{children}</span>;
}

export function ConsoleStatus({
  children,
  error = false,
}: Readonly<{ children: ReactNode; error?: boolean }>) {
  return (
    <p aria-live="polite" className={`console-status${error ? " is-error" : ""}`} role="status">
      {children}
    </p>
  );
}

export function ConsoleSearchControl({
  ariaLabel,
  buttonLabel = "검색",
  className,
  defaultValue,
  disabled = false,
  maxLength,
  name,
  onChange,
  placeholder,
  value,
}: Readonly<{
  ariaLabel: string;
  buttonLabel?: string;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  maxLength?: number;
  name?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
}>) {
  return (
    <div className={`console-search-control${className ? ` ${className}` : ""}`}>
      <span aria-hidden="true" className="console-search-icon" />
      <input
        aria-label={ariaLabel}
        autoComplete="off"
        className="console-search-input"
        disabled={disabled}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        {...(maxLength !== undefined ? { maxLength } : {})}
        {...(name ? { name } : {})}
        {...(onChange
          ? {
              onChange: (event: ChangeEvent<HTMLInputElement>) =>
                onChange(event.currentTarget.value),
            }
          : {})}
        placeholder={placeholder}
        type="search"
        {...(value !== undefined ? { value } : {})}
      />
      <button className="console-search-button" disabled={disabled} type="submit">
        {buttonLabel}
      </button>
    </div>
  );
}
