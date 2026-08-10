package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class ChatMessageSearchService {

    private static final long NANOS_PER_MILLISECOND = 1_000_000L;

    private final ChatMessageSearchReader reader;
    private final ChatMessageSearchAccessResolver accessResolver;
    private final RoomSequenceReader sequenceReader;
    private final ChatMessageSearchNormalizer normalizer;
    private final ChatMessageSearchCursorCodec cursorCodec;
    private final ChatMessageSearchProperties properties;
    private final ChatMessageSearchRateLimiter rateLimiter;
    private final ChatMessageSearchConcurrencyGuard concurrencyGuard;
    private final ChatMessageSearchMetrics metrics;
    private final LongSupplier nanoTime;

    public ChatMessageSearchService(
            ChatMessageSearchReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            RoomSequenceReader sequenceReader,
            ChatMessageSearchNormalizer normalizer,
            ChatMessageSearchCursorCodec cursorCodec,
            ChatMessageSearchProperties properties
    ) {
        this(
                reader,
                accessResolver,
                sequenceReader,
                normalizer,
                cursorCodec,
                properties,
                ChatMessageSearchRateLimiter.permitAll(),
                ChatMessageSearchConcurrencyGuard.unlimited(),
                ChatMessageSearchMetrics.noop(),
                System::nanoTime);
    }

    ChatMessageSearchService(
            ChatMessageSearchReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            RoomSequenceReader sequenceReader,
            ChatMessageSearchNormalizer normalizer,
            ChatMessageSearchCursorCodec cursorCodec,
            ChatMessageSearchProperties properties,
            LongSupplier nanoTime
    ) {
        this(
                reader,
                accessResolver,
                sequenceReader,
                normalizer,
                cursorCodec,
                properties,
                ChatMessageSearchRateLimiter.permitAll(),
                ChatMessageSearchConcurrencyGuard.unlimited(),
                ChatMessageSearchMetrics.noop(),
                nanoTime);
    }

    ChatMessageSearchService(
            ChatMessageSearchReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            RoomSequenceReader sequenceReader,
            ChatMessageSearchNormalizer normalizer,
            ChatMessageSearchCursorCodec cursorCodec,
            ChatMessageSearchProperties properties,
            ChatMessageSearchRateLimiter rateLimiter,
            ChatMessageSearchConcurrencyGuard concurrencyGuard,
            ChatMessageSearchMetrics metrics,
            LongSupplier nanoTime
    ) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.accessResolver = Objects.requireNonNull(
                accessResolver,
                "accessResolver");
        this.sequenceReader = Objects.requireNonNull(
                sequenceReader,
                "sequenceReader");
        this.normalizer = Objects.requireNonNull(
                normalizer,
                "normalizer");
        this.cursorCodec = Objects.requireNonNull(
                cursorCodec,
                "cursorCodec");
        this.properties = Objects.requireNonNull(
                properties,
                "properties");
        this.rateLimiter = Objects.requireNonNull(
                rateLimiter,
                "rateLimiter");
        this.concurrencyGuard = Objects.requireNonNull(
                concurrencyGuard,
                "concurrencyGuard");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
        this.nanoTime = Objects.requireNonNull(nanoTime, "nanoTime");
    }

    public ChatMessageSearchPage search(
            String userId,
            String roomId,
            ChatMessageSearchCriteria criteria,
            String cursorToken
    ) {
        Objects.requireNonNull(criteria, "criteria");
        long startedAt = nanoTime.getAsLong();
        SearchProgress progress = new SearchProgress();
        recordMetric(metrics::request);
        try {
            ChatMessageSearchRateLimitDecision decision =
                    rateLimiter.tryAcquire(userId);
            if (!decision.allowed()) {
                recordMetric(metrics::rateLimited);
                throw new ChatMessageSearchException(
                        ChatMessageSearchErrorCode
                                .MESSAGE_SEARCH_RATE_LIMITED,
                        "Message search rate limit was exceeded",
                        decision.retryAfterMs());
            }
            ChatMessageSearchPage page;
            try (ChatMessageSearchConcurrencyGuard.Permit permit =
                         concurrencyGuard.tryAcquire()) {
                if (!permit.acquired()) {
                    throw unavailable(
                            "Message search concurrency limit was exceeded");
                }
                page = searchAdmitted(
                        userId,
                        roomId,
                        criteria,
                        cursorToken,
                        progress);
            }
            if (progress.deadlineReached) {
                recordMetric(metrics::deadlineReached);
            }
            Duration duration = elapsedSince(startedAt);
            recordMetric(() -> metrics.success(
                    progress.scanned,
                    progress.matches,
                    page.searchComplete(),
                    duration));
            return page;
        } catch (ChatMessageSearchException exception) {
            if (progress.deadlineReached) {
                recordMetric(metrics::deadlineReached);
            }
            Duration duration = elapsedSince(startedAt);
            recordMetric(() -> metrics.failure(
                    exception.code(),
                    progress.scanned,
                    progress.matches,
                    duration));
            throw exception;
        } catch (RuntimeException exception) {
            ChatMessageSearchException wrapped = internal(
                    "Message search execution failed",
                    exception);
            Duration duration = elapsedSince(startedAt);
            recordMetric(() -> metrics.failure(
                    wrapped.code(),
                    progress.scanned,
                    progress.matches,
                    duration));
            throw wrapped;
        }
    }

    private ChatMessageSearchPage searchAdmitted(
            String userId,
            String roomId,
            ChatMessageSearchCriteria criteria,
            String cursorToken,
            SearchProgress progress
    ) {
        ChatMessageSearchAccess initialAccess = requireAccess(
                accessResolver.resolve(userId, roomId));
        ChatMessageSearchCursorBinding binding = binding(
                roomId,
                initialAccess,
                criteria);
        ChatMessageSearchCursor cursor = cursorCodec.decode(
                cursorToken,
                binding);
        long currentRoomSequence = currentSequence(roomId);
        long upperBound = cursor == null
                ? currentRoomSequence
                : cursor.searchUpperBoundSequence();
        if (upperBound > currentRoomSequence) {
            throw invalidCursor();
        }
        Long beforeSequence = cursor == null
                ? null
                : cursor.nextBeforeSequence();

        if (upperBound
                <= initialAccess.messageVisibleAfterSequence()) {
            verifyAccessUnchanged(userId, roomId, initialAccess, cursor);
            return new ChatMessageSearchPage(List.of(), null, true);
        }

        long deadline = deadlineNanos();
        List<ChatMessage> matches = new ArrayList<>();
        Long lastScannedSequence = null;
        boolean complete = false;

        while (matches.size() < criteria.resultLimit()
                && progress.scanned
                < properties.getMaxScannedPerRequest()) {
            Duration remaining = remainingDuration(deadline);
            if (remaining == null) {
                progress.deadlineReached = true;
                break;
            }
            int chunkLimit = Math.min(
                    properties.getCandidateChunkSize(),
                    properties.getMaxScannedPerRequest()
                            - progress.scanned);
            ChatMessageSearchCandidateSlice slice = readCandidates(
                    roomId,
                    initialAccess.messageVisibleAfterSequence(),
                    upperBound,
                    beforeSequence,
                    chunkLimit,
                    min(properties.getMongoQueryMaxTime(), remaining));
            verifySlice(
                    slice,
                    roomId,
                    initialAccess.messageVisibleAfterSequence(),
                    upperBound,
                    beforeSequence,
                    chunkLimit);

            if (slice.items().isEmpty()) {
                complete = true;
                break;
            }

            boolean consumedSlice = true;
            for (ChatMessage candidate : slice.items()) {
                if (remainingDuration(deadline) == null) {
                    progress.deadlineReached = true;
                    consumedSlice = false;
                    break;
                }
                progress.scanned++;
                lastScannedSequence = candidate.roomSequence();
                if (normalizer.normalizeContent(candidate.content())
                        .contains(criteria.normalizedQuery())) {
                    matches.add(candidate);
                    progress.matches++;
                }
                if (matches.size() == criteria.resultLimit()
                        || progress.scanned
                        == properties.getMaxScannedPerRequest()) {
                    consumedSlice = candidate == slice.items().getLast();
                    break;
                }
            }

            if (consumedSlice && !slice.hasOlderCandidates()) {
                complete = true;
                break;
            }
            if (!consumedSlice
                    || matches.size() == criteria.resultLimit()
                    || progress.scanned
                    == properties.getMaxScannedPerRequest()) {
                break;
            }
            beforeSequence = lastScannedSequence;
        }

        verifyAccessUnchanged(userId, roomId, initialAccess, cursor);
        if (complete) {
            return new ChatMessageSearchPage(matches, null, true);
        }
        if (lastScannedSequence == null) {
            throw unavailable("Message search deadline was exhausted");
        }
        String nextCursor = cursorCodec.encode(cursorCodec.issue(
                binding,
                upperBound,
                lastScannedSequence));
        return new ChatMessageSearchPage(
                matches,
                nextCursor,
                false);
    }

    private ChatMessageSearchCandidateSlice readCandidates(
            String roomId,
            long boundary,
            long upperBound,
            Long beforeSequence,
            int limit,
            Duration maxTime
    ) {
        try {
            return Objects.requireNonNull(reader.findCandidates(
                    roomId,
                    boundary,
                    upperBound,
                    beforeSequence,
                    limit,
                    maxTime), "candidate slice");
        } catch (ChatMessageSearchReaderException exception) {
            if (exception.kind()
                    == ChatMessageSearchReaderException.FailureKind
                    .STORAGE_UNAVAILABLE) {
                throw unavailable(
                        "Message search storage is unavailable",
                        exception);
            }
            throw internal("Message search data is inconsistent", exception);
        } catch (ChatMessageSearchException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw internal("Message search reader contract failed", exception);
        }
    }

    private void verifySlice(
            ChatMessageSearchCandidateSlice slice,
            String roomId,
            long boundary,
            long upperBound,
            Long beforeSequence,
            int requestedLimit
    ) {
        if (slice.items().size() > requestedLimit) {
            throw internal("Message search reader exceeded its limit");
        }
        long previousSequence = beforeSequence == null
                ? upperBound + 1
                : beforeSequence;
        for (ChatMessage candidate : slice.items()) {
            if (!roomId.equals(candidate.roomId())
                    || candidate.state() != MessageState.ACTIVE
                    || !candidate.countable()
                    || candidate.content() == null
                    || candidate.roomSequence() <= boundary
                    || candidate.roomSequence() > upperBound
                    || candidate.roomSequence() >= previousSequence) {
                throw internal("Message search reader returned invalid data");
            }
            previousSequence = candidate.roomSequence();
        }
    }

    private long currentSequence(String roomId) {
        try {
            return sequenceReader.currentSequence(roomId);
        } catch (IllegalStateException exception) {
            throw internal("Room sequence is inconsistent", exception);
        } catch (RuntimeException exception) {
            throw unavailable(
                    "Room sequence is temporarily unavailable",
                    exception);
        }
    }

    private void verifyAccessUnchanged(
            String userId,
            String roomId,
            ChatMessageSearchAccess initial,
            ChatMessageSearchCursor cursor
    ) {
        ChatMessageSearchAccess current = requireAccess(
                accessResolver.resolve(userId, roomId));
        boolean unchanged = initial.membershipId().equals(
                current.membershipId())
                && initial.membershipVersion().equals(
                current.membershipVersion())
                && initial.messageVisibleAfterSequence().equals(
                current.messageVisibleAfterSequence());
        if (!unchanged) {
            if (cursor != null) {
                throw invalidCursor();
            }
            throw unavailable("Room access changed during message search");
        }
    }

    private ChatMessageSearchAccess requireAccess(
            ChatMessageSearchAccess access
    ) {
        Objects.requireNonNull(access, "access");
        return switch (access.state()) {
            case ALLOWED -> access;
            case ACCESS_DENIED -> throw new ChatMessageSearchException(
                    ChatMessageSearchErrorCode.ACCESS_DENIED,
                    "An active room membership is required");
            case ROOM_NOT_AVAILABLE ->
                    throw new ChatMessageSearchException(
                            ChatMessageSearchErrorCode
                                    .MESSAGE_SEARCH_NOT_AVAILABLE,
                            "Message search is not available for this room");
            case UNAVAILABLE -> throw unavailable(
                    "Message search authorization is unavailable");
        };
    }

    private ChatMessageSearchCursorBinding binding(
            String roomId,
            ChatMessageSearchAccess access,
            ChatMessageSearchCriteria criteria
    ) {
        return new ChatMessageSearchCursorBinding(
                roomId,
                access.membershipId(),
                access.membershipVersion(),
                access.messageVisibleAfterSequence(),
                criteria.normalizedQueryFingerprint(),
                criteria.resultLimit());
    }

    private long deadlineNanos() {
        long now = nanoTime.getAsLong();
        long duration = properties.getRequestDeadline().toNanos();
        try {
            return Math.addExact(now, duration);
        } catch (ArithmeticException exception) {
            return Long.MAX_VALUE;
        }
    }

    private Duration remainingDuration(long deadline) {
        long remaining = deadline - nanoTime.getAsLong();
        if (remaining < NANOS_PER_MILLISECOND) {
            return null;
        }
        return Duration.ofNanos(remaining);
    }

    private Duration min(Duration left, Duration right) {
        return left.compareTo(right) <= 0 ? left : right;
    }

    private Duration elapsedSince(long startedAt) {
        long elapsed = Math.max(0, nanoTime.getAsLong() - startedAt);
        return Duration.ofNanos(elapsed);
    }

    private void recordMetric(Runnable recording) {
        try {
            recording.run();
        } catch (RuntimeException ignored) {
            // Observability failures must not affect search processing.
        }
    }

    private ChatMessageSearchException invalidCursor() {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.INVALID_CURSOR,
                "Invalid message search cursor");
    }

    private ChatMessageSearchException unavailable(String message) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.MESSAGE_SEARCH_UNAVAILABLE,
                message);
    }

    private ChatMessageSearchException unavailable(
            String message,
            Throwable cause
    ) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.MESSAGE_SEARCH_UNAVAILABLE,
                message,
                cause);
    }

    private ChatMessageSearchException internal(String message) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.INTERNAL_ERROR,
                message);
    }

    private ChatMessageSearchException internal(
            String message,
            Throwable cause
    ) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.INTERNAL_ERROR,
                message,
                cause);
    }

    private static final class SearchProgress {

        private int scanned;
        private int matches;
        private boolean deadlineReached;
    }
}
