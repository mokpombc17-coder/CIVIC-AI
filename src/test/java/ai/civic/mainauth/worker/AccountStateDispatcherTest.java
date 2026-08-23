package ai.civic.mainauth.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class AccountStateDispatcherTest extends PostgresIntegrationTest {
    @Autowired JdbcTemplate jdbc;

    @SuppressWarnings("unchecked")
    @Test
    void publishesCanonicalEventAndMarksOnlySuccessfulDelivery() {
        jdbc.update("delete from account_state_outbox");
        jdbc.update("""
                insert into account_state_outbox(user_id, account_state_version, state, event_payload)
                select id, account_state_version, 'ACTIVE',
                    jsonb_build_object('subject_id', id, 'version', account_state_version,
                                       'state', 'ACTIVE', 'at', now())
                from users where origin = 'BOOTSTRAP_ADMIN'
                """);
        var redis = mock(StringRedisTemplate.class);
        var streams = mock(StreamOperations.class);
        when(redis.opsForStream()).thenReturn(streams);
        when(streams.add(any(MapRecord.class))).thenReturn(null);

        var dispatcher = new AccountStateDispatcher(jdbc, redis);

        assertThat(dispatcher.dispatchOne()).isTrue();
        verify(streams).add(any(MapRecord.class));
        assertThat(jdbc.queryForObject(
                "select count(*) from account_state_outbox where delivered_at is not null",
                Integer.class)).isOne();
    }
}
