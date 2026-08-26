import { PlatformPageShell } from "@/components/platform-page-shell";

export default function Loading() {
  return (
    <PlatformPageShell title="로딩 중">
      <div className="platform-loading" aria-live="polite">
        화면을 준비하고 있습니다…
      </div>
    </PlatformPageShell>
  );
}
