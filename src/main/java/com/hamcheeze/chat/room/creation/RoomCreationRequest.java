package com.hamcheeze.chat.room.creation;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.idempotency.RoomClientRequestId;
import com.hamcheeze.chat.room.category.RoomCategoryIds;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public final class RoomCreationRequest {

    private static final Pattern CREATION_REQUEST_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,128}$");
    private static final Pattern REQUEST_FINGERPRINT =
            Pattern.compile("^sha256:[0-9a-f]{64}$");

    private final String creationRequestId;
    private final String clientRequestId;
    private final String requestFingerprint;
    private final String requesterUserId;
    private final String name;
    private final String description;
    private final List<String> categoryIds;
    private final RoomVisibility visibility;
    private final JoinPolicy joinPolicy;
    private final RoomCreationRequestStatus status;
    private final Instant requestedAt;
    private final Instant resolvedAt;
    private final RoomCreationDecisionActorType decisionActorType;
    private final String decidedByAdminId;
    private final String rejectionReason;
    private final String approvedRoomId;
    private final String ownerMembershipId;
    private final Long roomVersion;
    private final Long ownerMembershipVersion;
    private final long version;

    private RoomCreationRequest(
            String creationRequestId,
            String clientRequestId,
            String requestFingerprint,
            String requesterUserId,
            String name,
            String description,
            List<String> categoryIds,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            RoomCreationRequestStatus status,
            Instant requestedAt,
            Instant resolvedAt,
            RoomCreationDecisionActorType decisionActorType,
            String decidedByAdminId,
            String rejectionReason,
            String approvedRoomId,
            String ownerMembershipId,
            Long roomVersion,
            Long ownerMembershipVersion,
            long version
    ) {
        this.creationRequestId = requireCreationRequestId(
                creationRequestId);
        this.clientRequestId =
                RoomClientRequestId.canonicalize(clientRequestId);
        this.requestFingerprint = requireRequestFingerprint(
                requestFingerprint);
        this.requesterUserId = requireUserId(requesterUserId);
        this.name = requireRoomName(name);
        this.description = requireRoomDescription(description);
        this.categoryIds = canonicalCategoryIds(categoryIds);
        this.visibility = Objects.requireNonNull(
                visibility,
                "visibility");
        this.joinPolicy = Objects.requireNonNull(
                joinPolicy,
                "joinPolicy");
        this.status = Objects.requireNonNull(status, "status");
        this.requestedAt = Objects.requireNonNull(
                requestedAt,
                "requestedAt");
        this.resolvedAt = resolvedAt;
        this.decisionActorType = decisionActorType;
        this.decidedByAdminId = decidedByAdminId;
        this.rejectionReason =
                RoomCreationRejectionReason.canonicalize(
                        rejectionReason);
        this.approvedRoomId = approvedRoomId;
        this.ownerMembershipId = ownerMembershipId;
        this.roomVersion = roomVersion;
        this.ownerMembershipVersion = ownerMembershipVersion;
        this.version = requireVersion(version);
        validateState();
    }

    public static RoomCreationRequest pending(
            String creationRequestId,
            String clientRequestId,
            String requestFingerprint,
            String requesterUserId,
            String name,
            String description,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            Instant requestedAt
    ) {
        return new RoomCreationRequest(
                creationRequestId,
                clientRequestId,
                requestFingerprint,
                requesterUserId,
                name,
                description,
                List.of(),
                visibility,
                joinPolicy,
                RoomCreationRequestStatus.PENDING,
                requestedAt,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                0);
    }

    public static RoomCreationRequest restore(
            String creationRequestId,
            String clientRequestId,
            String requestFingerprint,
            String requesterUserId,
            String name,
            String description,
            List<String> categoryIds,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            RoomCreationRequestStatus status,
            Instant requestedAt,
            Instant resolvedAt,
            RoomCreationDecisionActorType decisionActorType,
            String decidedByAdminId,
            String rejectionReason,
            String approvedRoomId,
            String ownerMembershipId,
            Long roomVersion,
            Long ownerMembershipVersion,
            long version
    ) {
        return new RoomCreationRequest(
                creationRequestId,
                clientRequestId,
                requestFingerprint,
                requesterUserId,
                name,
                description,
                categoryIds,
                visibility,
                joinPolicy,
                status,
                requestedAt,
                resolvedAt,
                decisionActorType,
                decidedByAdminId,
                rejectionReason,
                approvedRoomId,
                ownerMembershipId,
                roomVersion,
                ownerMembershipVersion,
                version);
    }

    public RoomCreationRequest approveByAdmin(
            String adminUserId,
            List<String> categoryIds,
            String roomId,
            String membershipId,
            long approvedRoomVersion,
            long approvedMembershipVersion,
            Instant transitionTime
    ) {
        return approve(
                RoomCreationDecisionActorType.ADMIN,
                requireUserId(adminUserId),
                categoryIds,
                roomId,
                membershipId,
                approvedRoomVersion,
                approvedMembershipVersion,
                transitionTime);
    }

    public RoomCreationRequest approveAutomatically(
            List<String> categoryIds,
            String roomId,
            String membershipId,
            long approvedRoomVersion,
            long approvedMembershipVersion,
            Instant transitionTime
    ) {
        return approve(
                RoomCreationDecisionActorType.SYSTEM_AUTO_APPROVAL,
                null,
                categoryIds,
                roomId,
                membershipId,
                approvedRoomVersion,
                approvedMembershipVersion,
                transitionTime);
    }

    public RoomCreationRequest reject(
            String adminUserId,
            String reason,
            Instant transitionTime
    ) {
        requirePending();
        return copy(
                List.of(),
                RoomCreationRequestStatus.REJECTED,
                requireTransitionTime(transitionTime),
                RoomCreationDecisionActorType.ADMIN,
                requireUserId(adminUserId),
                RoomCreationRejectionReason.requireValid(reason),
                null,
                null,
                null,
                null);
    }

    public RoomCreationRequest cancel(Instant transitionTime) {
        requirePending();
        return copy(
                List.of(),
                RoomCreationRequestStatus.CANCELED,
                requireTransitionTime(transitionTime),
                RoomCreationDecisionActorType.REQUESTER,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    private RoomCreationRequest approve(
            RoomCreationDecisionActorType actorType,
            String adminUserId,
            List<String> approvedCategoryIds,
            String roomId,
            String membershipId,
            long approvedRoomVersion,
            long approvedMembershipVersion,
            Instant transitionTime
    ) {
        requirePending();
        return copy(
                RoomCategoryIds.requireValid(approvedCategoryIds),
                RoomCreationRequestStatus.APPROVED,
                requireTransitionTime(transitionTime),
                actorType,
                adminUserId,
                null,
                requireText(roomId),
                requireText(membershipId),
                requireVersion(approvedRoomVersion),
                requireVersion(approvedMembershipVersion));
    }

    private RoomCreationRequest copy(
            List<String> nextCategoryIds,
            RoomCreationRequestStatus nextStatus,
            Instant nextResolvedAt,
            RoomCreationDecisionActorType nextDecisionActorType,
            String nextDecidedByAdminId,
            String nextRejectionReason,
            String nextApprovedRoomId,
            String nextOwnerMembershipId,
            Long nextRoomVersion,
            Long nextOwnerMembershipVersion
    ) {
        return new RoomCreationRequest(
                creationRequestId,
                clientRequestId,
                requestFingerprint,
                requesterUserId,
                name,
                description,
                nextCategoryIds,
                visibility,
                joinPolicy,
                nextStatus,
                requestedAt,
                nextResolvedAt,
                nextDecisionActorType,
                nextDecidedByAdminId,
                nextRejectionReason,
                nextApprovedRoomId,
                nextOwnerMembershipId,
                nextRoomVersion,
                nextOwnerMembershipVersion,
                nextVersion());
    }

    private void requirePending() {
        if (status != RoomCreationRequestStatus.PENDING) {
            throw error(
                    RoomCreationRequestDomainErrorCode
                            .INVALID_TRANSITION);
        }
    }

    private Instant requireTransitionTime(Instant transitionTime) {
        Instant resolved = Objects.requireNonNull(
                transitionTime,
                "transitionTime");
        if (resolved.isBefore(requestedAt)) {
            throw error(
                    RoomCreationRequestDomainErrorCode
                            .INVALID_TRANSITION);
        }
        return resolved;
    }

    private long nextVersion() {
        if (version == Long.MAX_VALUE) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_VERSION);
        }
        return version + 1;
    }

    private void validateState() {
        if (resolvedAt != null && resolvedAt.isBefore(requestedAt)) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_STATE);
        }
        switch (status) {
            case PENDING -> requirePendingState();
            case APPROVED -> requireApprovedState();
            case REJECTED -> requireRejectedState();
            case CANCELED -> requireCanceledState();
        }
    }

    private void requirePendingState() {
        if (!categoryIds.isEmpty()
                || resolvedAt != null
                || decisionActorType != null
                || decidedByAdminId != null
                || rejectionReason != null
                || hasApprovedRoom()) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_STATE);
        }
    }

    private void requireApprovedState() {
        if (categoryIds.isEmpty()
                || resolvedAt == null
                || decisionActorType == null
                || rejectionReason != null
                || !hasCompleteApprovedRoom()
                || (decisionActorType
                        == RoomCreationDecisionActorType.ADMIN)
                        != (decidedByAdminId != null)
                || decisionActorType
                        == RoomCreationDecisionActorType.REQUESTER) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_STATE);
        }
        if (decidedByAdminId != null) {
            requireUserId(decidedByAdminId);
        }
    }

    private void requireRejectedState() {
        if (!categoryIds.isEmpty()
                || resolvedAt == null
                || decisionActorType
                        != RoomCreationDecisionActorType.ADMIN
                || decidedByAdminId == null
                || !RoomCreationRejectionReason.isValid(
                        rejectionReason)
                || hasApprovedRoom()) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_STATE);
        }
        requireUserId(decidedByAdminId);
    }

    private void requireCanceledState() {
        if (!categoryIds.isEmpty()
                || resolvedAt == null
                || decisionActorType
                        != RoomCreationDecisionActorType.REQUESTER
                || decidedByAdminId != null
                || rejectionReason != null
                || hasApprovedRoom()) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_STATE);
        }
    }

    private boolean hasApprovedRoom() {
        return approvedRoomId != null
                || ownerMembershipId != null
                || roomVersion != null
                || ownerMembershipVersion != null;
    }

    private boolean hasCompleteApprovedRoom() {
        if (approvedRoomId == null
                || ownerMembershipId == null
                || roomVersion == null
                || ownerMembershipVersion == null) {
            return false;
        }
        requireText(approvedRoomId);
        requireText(ownerMembershipId);
        requireVersion(roomVersion);
        requireVersion(ownerMembershipVersion);
        return true;
    }

    private static String requireCreationRequestId(String value) {
        if (value == null
                || !CREATION_REQUEST_ID.matcher(value).matches()) {
            throw error(
                    RoomCreationRequestDomainErrorCode
                            .INVALID_CREATION_REQUEST_ID);
        }
        return value;
    }

    private static String requireRequestFingerprint(String value) {
        if (value == null
                || !REQUEST_FINGERPRINT.matcher(value).matches()) {
            throw error(
                    RoomCreationRequestDomainErrorCode
                            .INVALID_REQUEST_FINGERPRINT);
        }
        return value;
    }

    private static String requireUserId(String value) {
        if (value == null || value.isBlank()) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_USER_ID);
        }
        return value;
    }

    private static String requireRoomName(String value) {
        if (value == null) {
            throw invalidProposedRoom();
        }
        String canonical = value.trim();
        if (canonical.isEmpty()
                || canonical.length() > Room.MAX_NAME_LENGTH) {
            throw invalidProposedRoom();
        }
        return canonical;
    }

    private static String requireRoomDescription(String value) {
        if (value == null) {
            throw invalidProposedRoom();
        }
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            if (codePoint < 0x20
                    && codePoint != '\t'
                    && codePoint != '\n'
                    && codePoint != '\r') {
                throw invalidProposedRoom();
            }
            offset += Character.charCount(codePoint);
        }
        String canonical = value.strip();
        if (canonical.codePointCount(0, canonical.length())
                > Room.MAX_DESCRIPTION_CODE_POINTS) {
            throw invalidProposedRoom();
        }
        return canonical;
    }

    private static String requireText(String value) {
        if (value == null || value.isBlank()) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_STATE);
        }
        return value;
    }

    private static List<String> canonicalCategoryIds(
            List<String> categoryIds
    ) {
        List<String> values = List.copyOf(
                Objects.requireNonNull(categoryIds, "categoryIds"));
        return values.isEmpty()
                ? values
                : RoomCategoryIds.requireValid(values);
    }

    private static long requireVersion(long value) {
        if (value < 0) {
            throw error(
                    RoomCreationRequestDomainErrorCode.INVALID_VERSION);
        }
        return value;
    }

    private static RoomCreationRequestDomainException
    invalidProposedRoom() {
        return error(
                RoomCreationRequestDomainErrorCode.INVALID_PROPOSED_ROOM);
    }

    private static RoomCreationRequestDomainException error(
            RoomCreationRequestDomainErrorCode code
    ) {
        return new RoomCreationRequestDomainException(code);
    }

    public String creationRequestId() {
        return creationRequestId;
    }

    public String clientRequestId() {
        return clientRequestId;
    }

    public String requestFingerprint() {
        return requestFingerprint;
    }

    public String requesterUserId() {
        return requesterUserId;
    }

    public String name() {
        return name;
    }

    public String description() {
        return description;
    }

    public List<String> categoryIds() {
        return categoryIds;
    }

    public RoomVisibility visibility() {
        return visibility;
    }

    public JoinPolicy joinPolicy() {
        return joinPolicy;
    }

    public RoomCreationRequestStatus status() {
        return status;
    }

    public Instant requestedAt() {
        return requestedAt;
    }

    public Instant resolvedAt() {
        return resolvedAt;
    }

    public RoomCreationDecisionActorType decisionActorType() {
        return decisionActorType;
    }

    public String decidedByAdminId() {
        return decidedByAdminId;
    }

    public String rejectionReason() {
        return rejectionReason;
    }

    public String approvedRoomId() {
        return approvedRoomId;
    }

    public String ownerMembershipId() {
        return ownerMembershipId;
    }

    public Long roomVersion() {
        return roomVersion;
    }

    public Long ownerMembershipVersion() {
        return ownerMembershipVersion;
    }

    public long version() {
        return version;
    }
}
