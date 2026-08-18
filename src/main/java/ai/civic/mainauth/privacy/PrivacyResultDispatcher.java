package ai.civic.mainauth.privacy;

import java.util.UUID;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.Limit;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class PrivacyResultDispatcher {
    static final String RESULT_STREAM = "civic.privacy-result.v1";

    private final StringRedisTemplate redis;
    private final PrivacyResultConsumer results;

    public PrivacyResultDispatcher(StringRedisTemplate redis, PrivacyResultConsumer results) {
        this.redis = redis;
        this.results = results;
    }

    public boolean dispatchOne() {
        var records = redis.opsForStream().range(
                RESULT_STREAM, Range.unbounded(), Limit.limit().count(1));
        if (records == null || records.isEmpty()) return false;
        var record = records.getFirst();
        var values = record.getValue();
        var operationId = String.valueOf(values.get("operation_id"));
        var service = String.valueOf(values.get("service_code"));
        var status = String.valueOf(values.get("result_status"));
        var evidence = String.valueOf(values.get("aggregate_evidence"));
        results.accept(UUID.fromString(operationId), service, status, evidence);
        redis.opsForStream().delete(RESULT_STREAM, record.getId());
        return true;
    }
}
