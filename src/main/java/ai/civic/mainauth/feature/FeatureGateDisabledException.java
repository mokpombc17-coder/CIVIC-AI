package ai.civic.mainauth.feature;

public final class FeatureGateDisabledException extends IllegalStateException {
    public FeatureGateDisabledException(String gateKey) {
        super(gateKey + " is disabled");
    }
}
