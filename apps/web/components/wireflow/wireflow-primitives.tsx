import type { InputHTMLAttributes, ReactNode } from "react";

type WireflowCardProps = Readonly<{
  children: ReactNode;
  className?: string | undefined;
  dataWireflowSlot?: string | undefined;
  title?: string | undefined;
}>;

export function WireflowCard({ children, className, dataWireflowSlot, title }: WireflowCardProps) {
  return (
    <section className={join("wf-card", className)} data-wireflow-slot={dataWireflowSlot}>
      {title ? (
        <header className="wf-card-heading">
          <h2>{title}</h2>
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function WireflowBadge({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="wf-badge">{children}</span>;
}

type WireflowFieldProps = Readonly<
  {
    label: string;
    name: string;
  } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name">
>;

export function WireflowField({ label, name, ...input }: WireflowFieldProps) {
  const id = `wf-${name}`;
  return (
    <div className="wf-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} {...input} />
    </div>
  );
}

type WireflowButtonProps = Readonly<{
  "aria-controls"?: string | undefined;
  "aria-expanded"?: boolean | undefined;
  "aria-label"?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
  dataWireflowSlot?: string | undefined;
  disabled?: boolean | undefined;
  onClick?: (() => void) | undefined;
  type?: "button" | "submit" | "reset" | undefined;
  variant?: "primary" | "secondary" | "danger" | undefined;
}>;

export function WireflowButton({
  "aria-controls": ariaControls,
  "aria-expanded": ariaExpanded,
  "aria-label": ariaLabel,
  children,
  className,
  dataWireflowSlot,
  disabled,
  onClick,
  type = "button",
  variant = "primary",
}: WireflowButtonProps) {
  return (
    <button
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      className={join("wf-button", `wf-button-${variant}`, className)}
      data-wireflow-slot={dataWireflowSlot}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function join(...classes: readonly (string | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
