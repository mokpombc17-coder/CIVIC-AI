package com.hamcheeze.chat.room.inbox.summary.maintenance;

public final class RoomInboxSummaryMaintenanceReport {

    private final RoomInboxSummaryMaintenanceMode mode;
    private long roomsWithMessages;
    private long summariesObserved;
    private long created;
    private long advancedSequence;
    private long refreshedVersion;
    private long repairedSnapshot;
    private long unchanged;
    private long ahead;
    private long orphanSummaries;
    private long unsupportedSchemas;
    private long malformedMessages;
    private long malformedSummaries;
    private long sequenceViolations;
    private long concurrentlyChanged;
    private long failures;
    private long projectionViolations;

    public RoomInboxSummaryMaintenanceReport(
            RoomInboxSummaryMaintenanceMode mode
    ) {
        this.mode = mode;
    }

    public void incrementRoomsWithMessages() {
        roomsWithMessages++;
    }

    public void incrementSummariesObserved() {
        summariesObserved++;
    }

    public void addSummariesObserved(long count) {
        summariesObserved += count;
    }

    public void recordAction(RoomInboxSummaryMaintenanceAction action) {
        switch (action) {
            case CREATE -> created++;
            case ADVANCE_SEQUENCE -> advancedSequence++;
            case REFRESH_VERSION -> refreshedVersion++;
            case REPAIR_SNAPSHOT -> repairedSnapshot++;
            case UNCHANGED -> unchanged++;
            case AHEAD -> ahead++;
            case UNSUPPORTED_SCHEMA -> unsupportedSchemas++;
            case MALFORMED -> malformedSummaries++;
            case CONCURRENTLY_CHANGED -> concurrentlyChanged++;
            case FAILED -> failures++;
            case ORPHAN_SUMMARY -> orphanSummaries++;
        }
    }

    public void incrementMalformedMessages() {
        malformedMessages++;
    }

    public void incrementMalformedSummaries() {
        malformedSummaries++;
    }

    public void incrementUnsupportedSchemas() {
        unsupportedSchemas++;
    }

    public void incrementSequenceViolations() {
        sequenceViolations++;
    }

    public void incrementProjectionViolations() {
        projectionViolations++;
    }

    public long violations() {
        return ahead
                + orphanSummaries
                + unsupportedSchemas
                + malformedMessages
                + malformedSummaries
                + sequenceViolations
                + concurrentlyChanged
                + failures
                + projectionViolations;
    }

    public boolean valid() {
        if (violations() != 0) {
            return false;
        }
        return mode != RoomInboxSummaryMaintenanceMode.DRY_RUN
                || created + advancedSequence + refreshedVersion
                + repairedSnapshot == 0;
    }

    public boolean completedSuccessfully() {
        return mode != RoomInboxSummaryMaintenanceMode.VALIDATE
                ? violations() == 0
                : valid();
    }

    public String toJson() {
        return "{" +
                "\"mode\":\"" + mode.commandValue() + "\"," +
                "\"valid\":" + valid() + "," +
                "\"roomsWithMessages\":" + roomsWithMessages + "," +
                "\"summariesObserved\":" + summariesObserved + "," +
                "\"created\":" + created + "," +
                "\"advancedSequence\":" + advancedSequence + "," +
                "\"refreshedVersion\":" + refreshedVersion + "," +
                "\"repairedSnapshot\":" + repairedSnapshot + "," +
                "\"unchanged\":" + unchanged + "," +
                "\"ahead\":" + ahead + "," +
                "\"orphanSummaries\":" + orphanSummaries + "," +
                "\"unsupportedSchemas\":" + unsupportedSchemas + "," +
                "\"malformedMessages\":" + malformedMessages + "," +
                "\"malformedSummaries\":" + malformedSummaries + "," +
                "\"sequenceViolations\":" + sequenceViolations + "," +
                "\"projectionViolations\":"
                + projectionViolations + "," +
                "\"concurrentlyChanged\":" + concurrentlyChanged + "," +
                "\"failures\":" + failures + "," +
                "\"violations\":" + violations() +
                "}";
    }

    public RoomInboxSummaryMaintenanceMode mode() {
        return mode;
    }

    public long roomsWithMessages() {
        return roomsWithMessages;
    }

    public long summariesObserved() {
        return summariesObserved;
    }

    public long created() {
        return created;
    }

    public long advancedSequence() {
        return advancedSequence;
    }

    public long refreshedVersion() {
        return refreshedVersion;
    }

    public long repairedSnapshot() {
        return repairedSnapshot;
    }

    public long unchanged() {
        return unchanged;
    }

    public long ahead() {
        return ahead;
    }

    public long orphanSummaries() {
        return orphanSummaries;
    }

    public long unsupportedSchemas() {
        return unsupportedSchemas;
    }

    public long malformedMessages() {
        return malformedMessages;
    }

    public long malformedSummaries() {
        return malformedSummaries;
    }

    public long sequenceViolations() {
        return sequenceViolations;
    }

    public long projectionViolations() {
        return projectionViolations;
    }

    public long concurrentlyChanged() {
        return concurrentlyChanged;
    }

    public long failures() {
        return failures;
    }
}
