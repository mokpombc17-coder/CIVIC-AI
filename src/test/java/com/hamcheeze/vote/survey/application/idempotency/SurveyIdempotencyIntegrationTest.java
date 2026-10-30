package com.hamcheeze.vote.survey.application.idempotency;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.survey.application.port.out.SurveyIdempotencyReceiptRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
class SurveyIdempotencyIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-01-01T00:00:00Z");
    private static final SurveyIdempotencyOutcomeCodec<TestOutcome> CODEC =
            new TestOutcomeCodec();

    @Autowired
    private IdempotentSurveySubmissionExecutor executor;

    @Autowired
    private SurveyIdempotencyReceiptRepository receipts;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSurveyData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE survey_content_versions CASCADE
                """);
    }

    @Test
    void concurrentSameKeyAndRequestExecuteOnceAndReplayTheOutcome()
            throws Exception {
        Seed seed = seedActiveRound();
        SurveyUserId userId = new SurveyUserId("same-key-user");
        SurveyResponseId responseId = new SurveyResponseId(UUID.randomUUID());
        insertResponse(responseId, userId, seed);
        SurveyIdempotencyCommand command = command(
                userId,
                UUID.randomUUID(),
                "same-request");
        TestOutcome success = success(responseId);
        AtomicInteger actionCalls = new AtomicInteger();
        CountDownLatch actionEntered = new CountDownLatch(1);
        CountDownLatch releaseAction = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);

        try {
            Future<SurveyIdempotencyExecution<TestOutcome>> first =
                    pool.submit(() -> executor.execute(
                            command,
                            CODEC,
                            () -> {
                                actionCalls.incrementAndGet();
                                actionEntered.countDown();
                                await(releaseAction);
                                return success;
                            }));
            assertThat(actionEntered.await(10, TimeUnit.SECONDS)).isTrue();
            Future<SurveyIdempotencyExecution<TestOutcome>> second =
                    pool.submit(() -> executor.execute(
                            command,
                            CODEC,
                            () -> {
                                actionCalls.incrementAndGet();
                                return success;
                            }));
            releaseAction.countDown();

            List<SurveyIdempotencyExecution<TestOutcome>> results = List.of(
                    first.get(10, TimeUnit.SECONDS),
                    second.get(10, TimeUnit.SECONDS));

            assertThat(results).extracting(
                            SurveyIdempotencyExecution::result)
                    .containsOnly(success);
            assertThat(results).extracting(
                            SurveyIdempotencyExecution::replayed)
                    .containsExactlyInAnyOrder(false, true);
            assertThat(actionCalls).hasValue(1);
            assertThat(receipts.findByRequest(
                            userId,
                            command.operation(),
                            command.idempotencyKey()))
                    .get()
                    .extracting(SurveyIdempotencyReceipt::status)
                    .isEqualTo(SurveyIdempotencyReceiptStatus.SUCCEEDED);
            assertThat(storedOutcomeCode(command)).isEqualTo(
                    "SURVEY_RESPONSE_SUBMITTED");
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void sameKeyWithADifferentRequestReturnsIdempotencyConflict() {
        Seed seed = seedActiveRound();
        SurveyUserId userId = new SurveyUserId("conflict-user");
        SurveyResponseId responseId = new SurveyResponseId(UUID.randomUUID());
        insertResponse(responseId, userId, seed);
        UUID key = UUID.randomUUID();
        executor.execute(
                command(userId, key, "first-request"),
                CODEC,
                () -> success(responseId));
        AtomicInteger conflictingActionCalls = new AtomicInteger();

        assertThatThrownBy(() -> executor.execute(
                command(userId, key, "different-request"),
                CODEC,
                () -> {
                    conflictingActionCalls.incrementAndGet();
                    return success(responseId);
                }))
                .isInstanceOfSatisfying(
                        SurveyIdempotencyException.class,
                        exception -> {
                            assertThat(exception.code()).isEqualTo(
                                    SurveyIdempotencyErrorCode
                                            .IDEMPOTENCY_CONFLICT);
                            assertThat(exception.httpStatus()).isEqualTo(409);
                        });
        assertThat(conflictingActionCalls).hasValue(0);
    }

    @Test
    void deterministicRejectionIsStoredAndReplayed() {
        SurveyUserId userId = new SurveyUserId("rejected-user");
        SurveyIdempotencyCommand command = command(
                userId,
                UUID.randomUUID(),
                "invalid-answer-request");
        AtomicInteger actionCalls = new AtomicInteger();

        SurveyIdempotencyExecution<TestOutcome> first = executor.execute(
                command,
                CODEC,
                () -> {
                    actionCalls.incrementAndGet();
                    return rejected();
                });
        SurveyIdempotencyExecution<TestOutcome> replay = executor.execute(
                command,
                CODEC,
                () -> {
                    actionCalls.incrementAndGet();
                    return rejected();
                });

        assertThat(first.replayed()).isFalse();
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.result()).isEqualTo(first.result());
        assertThat(actionCalls).hasValue(1);
        assertThat(receipts.findByRequest(
                        userId,
                        command.operation(),
                        command.idempotencyKey()))
                .get()
                .extracting(SurveyIdempotencyReceipt::status)
                .isEqualTo(SurveyIdempotencyReceiptStatus.REJECTED);
    }

    @Test
    void transientFailureRollsBackTheReceiptAndCanBeRetried() {
        Seed seed = seedActiveRound();
        SurveyUserId userId = new SurveyUserId("retry-user");
        SurveyResponseId responseId = new SurveyResponseId(UUID.randomUUID());
        insertResponse(responseId, userId, seed);
        SurveyIdempotencyCommand command = command(
                userId,
                UUID.randomUUID(),
                "retry-request");

        assertThatThrownBy(() -> executor.execute(
                command,
                CODEC,
                () -> {
                    throw new IllegalStateException("temporary failure");
                }))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("temporary failure");
        assertThat(receipts.findByRequest(
                userId,
                command.operation(),
                command.idempotencyKey())).isEmpty();

        SurveyIdempotencyExecution<TestOutcome> retry = executor.execute(
                command,
                CODEC,
                () -> success(responseId));

        assertThat(retry.replayed()).isFalse();
        assertThat(retry.result()).isEqualTo(success(responseId));
    }

    @Test
    void differentKeysForTheSameRoundLeaveOneResponseAndStableReceipts()
            throws Exception {
        Seed seed = seedActiveRound();
        SurveyUserId userId = new SurveyUserId("different-key-user");
        SurveyResponseId firstResponseId =
                new SurveyResponseId(UUID.randomUUID());
        SurveyResponseId secondResponseId =
                new SurveyResponseId(UUID.randomUUID());
        SurveyIdempotencyCommand firstCommand = command(
                userId,
                UUID.randomUUID(),
                "first-key-request");
        SurveyIdempotencyCommand secondCommand = command(
                userId,
                UUID.randomUUID(),
                "second-key-request");
        CyclicBarrier initialInsertBarrier = new CyclicBarrier(2);
        AtomicInteger actionCalls = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(2);

        try {
            Future<SurveyIdempotencyExecution<TestOutcome>> first =
                    pool.submit(() -> executor.execute(
                            firstCommand,
                            CODEC,
                            () -> submitOrReject(
                                    userId,
                                    seed,
                                    firstResponseId,
                                    initialInsertBarrier,
                                    actionCalls)));
            Future<SurveyIdempotencyExecution<TestOutcome>> second =
                    pool.submit(() -> executor.execute(
                            secondCommand,
                            CODEC,
                            () -> submitOrReject(
                                    userId,
                                    seed,
                                    secondResponseId,
                                    initialInsertBarrier,
                                    actionCalls)));

            List<SurveyIdempotencyExecution<TestOutcome>> results = List.of(
                    first.get(15, TimeUnit.SECONDS),
                    second.get(15, TimeUnit.SECONDS));

            assertThat(results).extracting(result ->
                            result.result().httpStatus())
                    .containsExactlyInAnyOrder(201, 409);
            assertThat(results).extracting(
                            SurveyIdempotencyExecution::replayed)
                    .containsOnly(false);
            assertThat(actionCalls).hasValue(3);
            assertThat(responseCount(userId, seed)).isEqualTo(1);
            assertThat(receiptStatuses(userId))
                    .containsExactlyInAnyOrder("SUCCEEDED", "REJECTED");
        } finally {
            pool.shutdownNow();
        }
    }

    private TestOutcome submitOrReject(
            SurveyUserId userId,
            Seed seed,
            SurveyResponseId responseId,
            CyclicBarrier initialInsertBarrier,
            AtomicInteger actionCalls
    ) {
        actionCalls.incrementAndGet();
        if (responseCount(userId, seed) > 0) {
            return rejected();
        }
        await(initialInsertBarrier);
        insertResponse(responseId, userId, seed);
        return success(responseId);
    }

    private Seed seedActiveRound() {
        UUID contentVersionId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        jdbcTemplate.update("""
                        INSERT INTO survey_content_versions (
                            content_version_id, version_number, status,
                            row_version, name, description,
                            created_by, created_at,
                            last_modified_by, last_modified_at,
                            published_by, published_at)
                        VALUES (?, 1, 'PUBLISHED', 0, 'test', NULL,
                            'admin', ?, 'admin', ?, 'admin', ?)
                        """,
                contentVersionId,
                Timestamp.from(NOW),
                Timestamp.from(NOW),
                Timestamp.from(NOW));
        jdbcTemplate.update("""
                        INSERT INTO survey_rounds (
                            round_id, round_number, content_version_id,
                            status, enforcement_mode,
                            activated_at, created_by, created_at)
                        VALUES (?, 1, ?, 'ACTIVE', 'REQUIRED',
                            ?, 'admin', ?)
                        """,
                roundId,
                contentVersionId,
                Timestamp.from(NOW),
                Timestamp.from(NOW));
        return new Seed(contentVersionId, roundId);
    }

    private void insertResponse(
            SurveyResponseId responseId,
            SurveyUserId userId,
            Seed seed
    ) {
        jdbcTemplate.update("""
                        INSERT INTO survey_responses (
                            response_id, user_id, round_id,
                            content_version_id, submitted_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                responseId.value(),
                userId.value(),
                seed.roundId(),
                seed.contentVersionId(),
                Timestamp.from(NOW.plusSeconds(1)));
    }

    private int responseCount(SurveyUserId userId, Seed seed) {
        return jdbcTemplate.queryForObject("""
                        SELECT count(*)
                        FROM survey_responses
                        WHERE user_id = ? AND round_id = ?
                        """,
                Integer.class,
                userId.value(),
                seed.roundId());
    }

    private List<String> receiptStatuses(SurveyUserId userId) {
        return jdbcTemplate.queryForList("""
                        SELECT status
                        FROM survey_idempotency_receipts
                        WHERE user_id = ?
                        """,
                String.class,
                userId.value());
    }

    private String storedOutcomeCode(SurveyIdempotencyCommand command) {
        return jdbcTemplate.queryForObject("""
                        SELECT outcome ->> 'code'
                        FROM survey_idempotency_receipts
                        WHERE user_id = ?
                          AND operation = ?
                          AND idempotency_key = ?
                        """,
                String.class,
                command.userId().value(),
                command.operation().name(),
                command.idempotencyKey().value());
    }

    private static SurveyIdempotencyCommand command(
            SurveyUserId userId,
            UUID key,
            String request
    ) {
        return new SurveyIdempotencyCommand(
                userId,
                SurveyIdempotencyOperation.SUBMIT_SURVEY_RESPONSE,
                new SurveyIdempotencyKey(key),
                SurveyRequestHash.sha256(
                        request.getBytes(StandardCharsets.UTF_8)),
                1);
    }

    private static TestOutcome success(SurveyResponseId responseId) {
        return new TestOutcome(
                201,
                "{\"code\":\"SURVEY_RESPONSE_SUBMITTED\"}",
                responseId);
    }

    private static TestOutcome rejected() {
        return new TestOutcome(
                409,
                "{\"code\":\"CURRENT_SURVEY_ALREADY_SUBMITTED\"}",
                null);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("latch timed out");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private static void await(CyclicBarrier barrier) {
        try {
            barrier.await(10, TimeUnit.SECONDS);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private record Seed(UUID contentVersionId, UUID roundId) {
    }

    private record TestOutcome(
            int httpStatus,
            String payload,
            SurveyResponseId responseId
    ) {
    }

    private static final class TestOutcomeCodec
            implements SurveyIdempotencyOutcomeCodec<TestOutcome> {

        @Override
        public StoredSurveyIdempotencyOutcome encode(TestOutcome result) {
            return new StoredSurveyIdempotencyOutcome(
                    1,
                    result.httpStatus(),
                    result.payload(),
                    result.responseId());
        }

        @Override
        public TestOutcome decode(
                StoredSurveyIdempotencyOutcome storedOutcome
        ) {
            return new TestOutcome(
                    storedOutcome.httpStatus(),
                    storedOutcome.payload().replace(": ", ":"),
                    storedOutcome.responseId());
        }
    }
}
