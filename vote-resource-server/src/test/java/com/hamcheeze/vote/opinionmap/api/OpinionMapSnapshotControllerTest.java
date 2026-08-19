package com.hamcheeze.vote.opinionmap.api;

import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotIntegrityException;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.OptionResult;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.ParticipantResponse;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.QuestionResult;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.SnapshotResult;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.SnapshotStatus;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OpinionMapSnapshotControllerTest {

    private static final UUID SNAPSHOT_ID = uuid(1);
    private final OpinionMapSnapshotQueryService snapshots =
            mock(OpinionMapSnapshotQueryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new OpinionMapSnapshotController(snapshots))
                .setControllerAdvice(new OpinionMapApiExceptionHandler())
                .build();
    }

    @Test
    void returnsFinalSnapshotContextCountsAndParticipantResponses()
            throws Exception {
        when(snapshots.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(result()));

        mockMvc.perform(get(
                        "/api/v1/opinion-map/snapshots/{snapshotId}",
                        SNAPSHOT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.snapshotId")
                        .value(SNAPSHOT_ID.toString()))
                .andExpect(jsonPath("$.status").value("FINALIZED"))
                .andExpect(jsonPath("$.task.question.content")
                        .value("질문 문구"))
                .andExpect(jsonPath("$.task.question.options[0].content")
                        .value("첫 번째 선택지"))
                .andExpect(jsonPath(
                        "$.task.question.options[0].responseCount")
                        .value(1))
                .andExpect(jsonPath("$.responses[0].participantId")
                        .value("participant-opaque"))
                .andExpect(jsonPath("$.responses[0].reasonSource")
                        .value("AI_ACCEPTED"))
                .andExpect(jsonPath("$.responses[0].finalReason")
                        .value("AI 예상 이유"))
                .andExpect(jsonPath("$.responseHashSha256")
                        .value("a".repeat(64)));
    }

    @Test
    void returnsNotFoundForUnknownSnapshot() throws Exception {
        when(snapshots.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.empty());

        mockMvc.perform(get(
                        "/api/v1/opinion-map/snapshots/{snapshotId}",
                        SNAPSHOT_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("OPINION_MAP_SNAPSHOT_NOT_FOUND"));
    }

    @Test
    void hidesIntegrityFailureDetails() throws Exception {
        when(snapshots.findBySnapshotId(SNAPSHOT_ID)).thenThrow(
                new OpinionMapSnapshotIntegrityException(
                        SNAPSHOT_ID, "sensitive detail"));

        mockMvc.perform(get(
                        "/api/v1/opinion-map/snapshots/{snapshotId}",
                        SNAPSHOT_ID))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code")
                        .value("OPINION_MAP_SNAPSHOT_INTEGRITY_FAILURE"))
                .andExpect(jsonPath("$.detail")
                        .value("The finalized opinion map snapshot failed verification."));
    }

    private static SnapshotResult result() {
        Instant closedAt = Instant.parse("2026-08-19T01:00:00Z");
        return new SnapshotResult(
                SNAPSHOT_ID,
                uuid(2),
                SnapshotStatus.FINALIZED,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                closedAt,
                closedAt.plusSeconds(1),
                1,
                1,
                "opinion-map-response-set-v1",
                "a".repeat(64),
                "투표 제목",
                "투표 설명",
                new QuestionResult(
                        uuid(3),
                        "질문 문구",
                        "질문 설명",
                        List.of(new OptionResult(
                                uuid(4), 1, "첫 번째 선택지", 1))),
                List.of(new ParticipantResponse(
                        uuid(5),
                        "participant-opaque",
                        uuid(6),
                        uuid(7),
                        uuid(8),
                        uuid(4),
                        OpinionMapReasonSource.AI_ACCEPTED,
                        uuid(9),
                        "AI 예상 이유",
                        closedAt.minusSeconds(1))));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13180000-0000-0000-0000-%012d".formatted(suffix));
    }
}
