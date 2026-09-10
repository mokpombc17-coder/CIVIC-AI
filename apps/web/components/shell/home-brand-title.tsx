export const HOME_SERVICE_REGION_LABEL = "전남광주";

export function HomeBrandTitle() {
  return (
    <span aria-label={`CIVIC.AI ${HOME_SERVICE_REGION_LABEL}`} className="civic-home-brand">
      <span className="civic-brand-title">CIVIC.AI</span>
      <span className="civic-region-badge">{HOME_SERVICE_REGION_LABEL}</span>
    </span>
  );
}
