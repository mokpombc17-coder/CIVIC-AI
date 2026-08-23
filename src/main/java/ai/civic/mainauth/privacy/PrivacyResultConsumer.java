package ai.civic.mainauth.privacy;

import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class PrivacyResultConsumer {
    private final PrivacyOperationService operations;

    public PrivacyResultConsumer(PrivacyOperationService operations) {
        this.operations = operations;
    }

    public void accept(UUID operationId, String service, String status, String aggregateEvidence) {
        operations.recordResult(operationId, service, status, aggregateEvidence);
    }
}
