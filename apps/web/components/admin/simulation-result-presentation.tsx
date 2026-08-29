import type { SimulationResultDetail } from "@/lib/admin/simulation-contracts";

export function AnonymousPanelAttributes({
  respondent,
}: Readonly<{ respondent: SimulationResultDetail }>) {
  return (
    <>
      <div>
        <dt>성별</dt>
        <dd>{respondent.demographics.gender ?? "미분류"}</dd>
      </div>
      <div>
        <dt>연령대</dt>
        <dd>{respondent.demographics.ageGroup ?? "미분류"}</dd>
      </div>
    </>
  );
}
