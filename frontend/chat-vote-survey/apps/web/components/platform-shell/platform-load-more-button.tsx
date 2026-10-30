export type PlatformLoadMoreButtonProps = Readonly<{
  exhaustedLabel?: string | undefined;
  hasNextPage: boolean;
  isFetching: boolean;
  label: string;
  onClick: () => void;
}>;

export function PlatformLoadMoreButton({
  exhaustedLabel,
  hasNextPage,
  isFetching,
  label,
  onClick,
}: PlatformLoadMoreButtonProps) {
  if (!hasNextPage) {
    return exhaustedLabel ? (
      <div className="mt-4 flex min-h-11 items-center justify-center text-center">
        <p className="text-sm font-medium text-[#59616b]" role="status">
          {exhaustedLabel}
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="mt-4 text-center">
      <button
        aria-busy={isFetching || undefined}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[6px] border border-[#ccd1d6] bg-white px-5 text-sm font-medium text-[#121417] transition hover:bg-[#edf2f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#266ef5] disabled:cursor-not-allowed disabled:opacity-50"
        data-platform-load-more-button="true"
        disabled={isFetching}
        onClick={onClick}
        type="button"
      >
        <span aria-live="polite" className="grid whitespace-nowrap">
          <span
            aria-hidden={isFetching}
            className={`col-start-1 row-start-1 ${isFetching ? "invisible" : ""}`}
          >
            {label}
          </span>
          <span
            aria-hidden={!isFetching}
            className={`col-start-1 row-start-1 ${isFetching ? "" : "invisible"}`}
          >
            불러오는 중…
          </span>
        </span>
      </button>
    </div>
  );
}
