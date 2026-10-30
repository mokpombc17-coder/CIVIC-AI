package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.inbox.model.RoomInboxView;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.CursorSlice;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class RoomInboxService {

    private static final Logger log = LoggerFactory.getLogger(
            RoomInboxService.class);

    private final RoomInboxPageReader pageReader;
    private final RoomReadStateStore readStateStore;
    private final RoomReadPositionResolver readPositionResolver;
    private final UnreadCountReader unreadCountReader;
    private final RoomInboxCursorCodec cursorCodec;
    private final RoomInboxStorageExceptionClassifier
            storageExceptionClassifier;
    private final Counter requestCounter;
    private final Counter inconsistentSummaryCounter;
    private final Timer queryTimer;

    public RoomInboxService(
            RoomInboxPageReader pageReader,
            RoomReadStateStore readStateStore,
            RoomReadPositionResolver readPositionResolver,
            UnreadCountReader unreadCountReader,
            RoomInboxCursorCodec cursorCodec,
            MeterRegistry meterRegistry
    ) {
        this.pageReader = Objects.requireNonNull(
                pageReader, "pageReader");
        this.readStateStore = Objects.requireNonNull(
                readStateStore, "readStateStore");
        this.readPositionResolver = Objects.requireNonNull(
                readPositionResolver, "readPositionResolver");
        this.unreadCountReader = Objects.requireNonNull(
                unreadCountReader, "unreadCountReader");
        this.cursorCodec = Objects.requireNonNull(
                cursorCodec, "cursorCodec");
        this.storageExceptionClassifier =
                new RoomInboxStorageExceptionClassifier();
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.requestCounter = meterRegistry.counter(
                "room.inbox.requests");
        this.inconsistentSummaryCounter = meterRegistry.counter(
                "room.inbox.summary.read.inconsistent");
        this.queryTimer = meterRegistry.timer(
                "room.inbox.query.duration");
    }

    public CursorPage<RoomInboxView> inbox(
            String userId,
            String cursor,
            int limit
    ) {
        long started = System.nanoTime();
        BestEffortMetricRecorder.increment(
                "room.inbox.requests", requestCounter);
        try {
            RoomInboxCursor decoded = cursorCodec.decode(cursor);
            CursorSlice<RoomInboxPageEntry> page = pageReader.findPage(
                    userId, decoded, limit);
            List<String> membershipIds = page.items().stream()
                    .map(entry -> entry.membership().membershipId())
                    .toList();
            Map<String, RoomReadState> states = readStateStore
                    .findByMembershipIds(membershipIds);
            List<RoomInboxView> views = new ArrayList<>();
            for (RoomInboxPageEntry entry : page.items()) {
                Membership membership = entry.membership();
                RoomReadState state = states.get(
                        membership.membershipId());
                RoomReadPosition position =
                        readPositionResolver.resolve(
                                membership, state);
                long readThrough = position
                        .effectiveReadThroughSequence();
                UnreadCount unread = unreadCountReader.count(
                        entry.room().roomId(), userId, readThrough);
                views.add(view(entry, readThrough, unread));
            }
            String nextCursor = null;
            if (page.hasNext()) {
                RoomInboxPageEntry last = page.items().getLast();
                nextCursor = cursorCodec.encode(new RoomInboxCursor(
                        RoomInboxCursor.CURRENT_VERSION,
                        RoomInboxCursor.Scope.MY_ROOM_INBOX,
                        last.lastActivityAt(),
                        last.room().roomId()));
            }
            return new CursorPage<>(views, nextCursor, page.hasNext());
        } catch (RoomInboxDataConsistencyException exception) {
            BestEffortMetricRecorder.increment(
                    "room.inbox.summary.read.inconsistent",
                    inconsistentSummaryCounter);
            log.error(
                    "Room inbox summary read inconsistency: "
                            + "roomId={} schemaVersion={} failureKind={}",
                    exception.roomId(),
                    exception.schemaVersion(),
                    exception.failureKind());
            throw new RoomInboxException(
                    RoomInboxErrorCode
                            .ROOM_INBOX_SUMMARY_INCONSISTENT,
                    "Room inbox summary is inconsistent",
                    exception);
        } catch (RoomInboxException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            if (storageExceptionClassifier.classify(exception)
                    .orElse(null)
                    == RoomInboxStorageExceptionClassifier.FailureKind
                    .RETRYABLE) {
                throw new RoomInboxException(
                        RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                        "Room inbox query is temporarily unavailable",
                        exception);
            }
            throw exception;
        } finally {
            BestEffortMetricRecorder.record(
                    "room.inbox.query.duration",
                    queryTimer,
                    Duration.ofNanos(Math.max(
                            0, System.nanoTime() - started)));
        }
    }

    private static RoomInboxView view(
            RoomInboxPageEntry entry,
            long readThrough,
            UnreadCount unread
    ) {
        return new RoomInboxView(
                entry.room().roomId(),
                entry.room().name(),
                entry.room().description(),
                entry.room().categoryIds(),
                entry.room().ownerMembershipId(),
                entry.room().ownerUserId(),
                entry.room().status(),
                entry.room().visibility(),
                entry.room().joinPolicy(),
                entry.room().activeMemberCount(),
                entry.room().createdAt(),
                entry.room().version(),
                entry.membership().membershipId(),
                entry.membership().role(),
                entry.membership().status(),
                entry.membership().joinedAt(),
                entry.membership().version(),
                readThrough,
                unread.value(),
                unread.capped(),
                entry.lastMessage(),
                entry.lastActivityAt());
    }

}
