package ai.civic.mainauth.privacy;

import java.util.UUID;
import java.util.LinkedHashMap;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.Limit;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class PrivacyResultDispatcher {
    static final String RESULT_STREAM = "civic.privacy-result.v1";
    static final String RESULT_DEAD_LETTER_STREAM = "civic.privacy-result-dead-letter.v1";

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
        try {
            results.accept(UUID.fromString(operationId), service, status, evidence);
        } catch (IllegalArgumentException exception) {
            var deadLetter = new LinkedHashMap<String, String>();
            deadLetter.put("source_record_id", record.getId().getValue());
            deadLetter.put("operation_id", operationId);
            deadLetter.put("service_code", service);
            deadLetter.put("result_status", status);
            deadLetter.put("aggregate_evidence", evidence);
            deadLetter.put("failure_code", "PERMANENT_VALIDATION_FAILURE");
            redis.opsForStream().add(
                    org.springframework.data.redis.connection.stream.StreamRecords
                            .mapBacked(deadLetter)
                            .withStreamKey(RESULT_DEAD_LETTER_STREAM));
            redis.opsForStream().delete(RESULT_STREAM, record.getId());
            return true;
        }
        redis.opsForStream().delete(RESULT_STREAM, record.getId());
        return true;
    }
}
