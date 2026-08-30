"use client";

import type { ChangeEvent, ReactNode } from "react";

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
}: Readonly<{
  tabs: readonly ConsoleTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}>) {
  return (
    <div aria-label={ariaLabel} className="console-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={tab.id === activeId}
          className="console-tab"
          disabled={tab.disabled}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export type ConsoleMetricItem = Readonly<{
  label: string;
  value: string;
  description?: string;
  alert?: boolean;
}>;

export function ConsoleMetricStrip({
  metrics,
  ariaLabel,
}: Readonly<{ metrics: readonly ConsoleMetricItem[]; ariaLabel: string }>) {
  return (
    <ul aria-label={ariaLabel} className="console-metrics">
      {metrics.map((metric) => (
        <li className={`console-metric${metric.alert ? " is-alert" : ""}`} key={metric.label}>
          <small>{metric.label}</small>
          <strong>{metric.value}</strong>
          {metric.description ? <span>{metric.description}</span> : null}
        </li>
      ))}
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
