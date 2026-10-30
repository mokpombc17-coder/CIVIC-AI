package com.hamcheeze.chat.room.creation.mongo;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestInsertOutcome;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestInsertResult;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestStore;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestSlice;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.index.IndexInfo;
import org.springframework.test.context.ActiveProfiles;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("local")
class MongoRoomCreationRequestStoreTest
        extends MongoRuntimeIntegrationTest {

    private static final Instant REQUESTED_AT =
            Instant.parse("2026-08-25T02:00:00Z");

    @Autowired
    private RoomCreationRequestStore store;

    @Test
    void insertsAndFindsPendingRequest() {
        RoomCreationRequest request = pending(1, "user-1");

        RoomCreationRequestInsertResult result =
                store.insertPending(request, 3);

        assertThat(result.outcome())
                .isEqualTo(RoomCreationRequestInsertOutcome.INSERTED);
        assertThat(store.findById(request.creationRequestId()))
                .hasValueSatisfying(stored ->
                        assertThat(stored.creationRequestId())
                                .isEqualTo(
                                        request.creationRequestId()));
        assertThat(store.findByRequest(
                request.requesterUserId(),
                request.clientRequestId()))
                .hasValueSatisfying(stored ->
                        assertThat(stored.requestFingerprint())
                                .isEqualTo(
                                        request.requestFingerprint()));
        assertThat(store.countPendingByRequester("user-1"))
                .isEqualTo(1);
    }

    @Test
    void sameRequesterAndClientRequestReturnsExistingRequest() {
        RoomCreationRequest original = pending(1, "user-1");
        store.insertPending(original, 3);
        RoomCreationRequest duplicate = RoomCreationRequest.pending(
                "request-duplicate",
                original.clientRequestId(),
                "sha256:" + "b".repeat(64),
                original.requesterUserId(),
                "다른 이름",
                "",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                REQUESTED_AT);

        RoomCreationRequestInsertResult result =
                store.insertPending(duplicate, 3);

        assertThat(result.outcome()).isEqualTo(
                RoomCreationRequestInsertOutcome.EXISTING_REQUEST);
        assertThat(result.request().creationRequestId())
                .isEqualTo(original.creationRequestId());
        assertThat(store.countPendingByRequester("user-1"))
                .isEqualTo(1);
    }

    @Test
    void duplicateCreationRequestIdIsNotMisclassifiedAsLimit() {
        store.insertPending(pending(1, "user-1"), 3);

        assertThatThrownBy(() -> store.insertPending(
                pendingWithIds(
                        "request-1",
                        clientRequestId(2),
                        "user-2"),
                3)).isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void pendingSlotsAtomicallyLimitConcurrentRequestsToThree()
            throws Exception {
        int attempts = 8;
        ExecutorService executor =
                Executors.newFixedThreadPool(attempts);
        CountDownLatch ready = new CountDownLatch(attempts);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<RoomCreationRequestInsertResult>> futures =
                new ArrayList<>();
        try {
            for (int index = 1; index <= attempts; index++) {
                RoomCreationRequest request = pending(index, "user-1");
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException(
                                "start latch timed out");
                    }
                    return store.insertPending(request, 3);
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<RoomCreationRequestInsertOutcome> outcomes =
                    new ArrayList<>();
            for (Future<RoomCreationRequestInsertResult> future
                    : futures) {
                outcomes.add(future.get(20, TimeUnit.SECONDS)
                        .outcome());
            }

            assertThat(outcomes).filteredOn(outcome -> outcome
                            == RoomCreationRequestInsertOutcome.INSERTED)
                    .hasSize(3);
            assertThat(outcomes).filteredOn(outcome -> outcome
                            == RoomCreationRequestInsertOutcome
                            .PENDING_LIMIT_REACHED)
                    .hasSize(5);
            assertThat(store.countPendingByRequester("user-1"))
                    .isEqualTo(3);
            assertThat(pendingSlots("user-1"))
                    .containsExactlyInAnyOrder(0, 1, 2);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void terminalCompareAndSetFreesPendingSlot() {
        RoomCreationRequest first = pending(1, "user-1");
        RoomCreationRequest second = pending(2, "user-1");
        RoomCreationRequest third = pending(3, "user-1");
        store.insertPending(first, 3);
        store.insertPending(second, 3);
        store.insertPending(third, 3);
        assertThat(store.insertPending(pending(4, "user-1"), 3)
                .outcome()).isEqualTo(
                RoomCreationRequestInsertOutcome
                        .PENDING_LIMIT_REACHED);

        RoomCreationRequest rejected = first.reject(
                "admin-1",
                "요건 미충족",
                REQUESTED_AT.plusSeconds(1));
        assertThat(store.replacePendingIfVersionMatches(
                rejected,
                first.version())).isTrue();
        assertThat(store.replacePendingIfVersionMatches(
                first.cancel(REQUESTED_AT.plusSeconds(2)),
                first.version())).isFalse();

        assertThat(store.insertPending(pending(4, "user-1"), 3)
                .outcome()).isEqualTo(
                RoomCreationRequestInsertOutcome.INSERTED);
        assertThat(store.countPendingByRequester("user-1"))
                .isEqualTo(3);
        assertThat(store.findById(first.creationRequestId()))
                .hasValueSatisfying(stored -> {
                    assertThat(stored.status()).isEqualTo(
                            RoomCreationRequestStatus.REJECTED);
                    assertThat(stored.rejectionReason())
                            .isEqualTo("요건 미충족");
                });
    }

    @Test
    void statusCursorReadsOldestRequestsWithoutCrossingStatus() {
        RoomCreationRequest first = pending(1, "user-1");
        RoomCreationRequest second = pending(2, "user-2");
        RoomCreationRequest rejected = pending(3, "user-3").reject(
                "admin-1",
                "요건 미충족",
                REQUESTED_AT.plusSeconds(1));
        store.insertPending(first, 3);
        store.insertPending(second, 3);
        store.insertPending(pending(3, "user-3"), 3);
        assertThat(store.replacePendingIfVersionMatches(
                rejected,
                0)).isTrue();

        RoomCreationRequestSlice firstPage = store.findByStatus(
                RoomCreationRequestStatus.PENDING,
                null,
                null,
                1);
        assertThat(firstPage.items())
                .extracting(RoomCreationRequest::creationRequestId)
                .containsExactly("request-1");
        assertThat(firstPage.hasNext()).isTrue();

        RoomCreationRequestSlice secondPage = store.findByStatus(
                RoomCreationRequestStatus.PENDING,
                first.requestedAt(),
                first.creationRequestId(),
                1);
        assertThat(secondPage.items())
                .extracting(RoomCreationRequest::creationRequestId)
                .containsExactly("request-2");
        assertThat(secondPage.hasNext()).isFalse();

        assertThat(store.findByStatus(
                        RoomCreationRequestStatus.REJECTED,
                        null,
                        null,
                        10).items())
                .extracting(RoomCreationRequest::creationRequestId)
                .containsExactly("request-3");
    }

    @Test
    void schemaDefinesIdempotencySlotAndCursorIndexes() {
        Set<String> names = mongoOperations.indexOps(
                        MongoRoomCreationRequestDocument
                                .COLLECTION_NAME)
                .getIndexInfo()
                .stream()
                .map(IndexInfo::getName)
                .collect(java.util.stream.Collectors.toSet());

        assertThat(names).contains(
                MongoRoomCreationRequestSchemaInitializer
                        .REQUESTER_CLIENT_REQUEST_INDEX_NAME,
                MongoRoomCreationRequestSchemaInitializer
                        .PENDING_SLOT_INDEX_NAME,
                MongoRoomCreationRequestSchemaInitializer
                        .STATUS_CURSOR_INDEX_NAME,
                MongoRoomCreationRequestSchemaInitializer
                        .REQUESTER_CURSOR_INDEX_NAME);
    }

    private Set<Integer> pendingSlots(String userId) {
        Set<Integer> slots = new HashSet<>();
        mongoOperations.getCollection(
                        MongoRoomCreationRequestDocument.COLLECTION_NAME)
                .find(new Document("requesterUserId", userId)
                        .append("status", "PENDING"))
                .forEach(document -> slots.add(
                        document.getInteger("pendingSlot")));
        return slots;
    }

    private static RoomCreationRequest pending(
            int number,
            String userId
    ) {
        return pendingWithIds(
                "request-" + number,
                clientRequestId(number),
                userId);
    }

    private static RoomCreationRequest pendingWithIds(
            String requestId,
            String clientRequestId,
            String userId
    ) {
        return RoomCreationRequest.pending(
                requestId,
                clientRequestId,
                "sha256:" + "a".repeat(64),
                userId,
                "정책 토론 " + requestId,
                "설명",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                REQUESTED_AT);
    }

    private static String clientRequestId(int number) {
        return UUID.nameUUIDFromBytes(
                        ("room-request-" + number)
                                .getBytes(StandardCharsets.UTF_8))
                .toString();
    }
}
