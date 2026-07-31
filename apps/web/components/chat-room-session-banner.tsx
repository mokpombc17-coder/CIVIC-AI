export type ChatRoomSessionBannerProps = Readonly<{
  canReactivate: boolean;
  description: string;
  kind: "active" | "pending" | "replaced" | "error";
  onReactivate: () => void;
  title: string;
}>;

export function ChatRoomSessionBanner({
  canReactivate,
  description,
  kind,
  onReactivate,
  title,
}: ChatRoomSessionBannerProps) {
  return (
    <div
      aria-live="polite"
      className={`border-t px-5 py-4 ${
        kind === "active"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : kind === "replaced"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : kind === "error"
              ? "border-red-200 bg-red-50 text-red-950"
              : "border-slate-200 bg-slate-50 text-slate-800"
      }`}
      role={kind === "error" || kind === "replaced" ? "alert" : "status"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs opacity-75">{description}</p>
        </div>

        {canReactivate ? (
          <button className="secondary-button" onClick={onReactivate} type="button">
            이 탭에서 다시 활성화
          </button>
        ) : null}
      </div>
    </div>
  );
}
