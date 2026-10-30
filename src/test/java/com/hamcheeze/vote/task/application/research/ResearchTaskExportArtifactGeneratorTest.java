package com.hamcheeze.vote.task.application.research;

import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.application.research.ResearchTaskExportParticipant.PredictionCandidate;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryAssembler;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.application.result.VerifiedTaskResultView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;

class ResearchTaskExportArtifactGeneratorTest {

    private static final TaskId TASK_ID = new TaskId(new UUID(0, 1));
    private static final Instant CLOSED_AT =
            Instant.parse("2026-09-07T01:00:00Z");
    private static final Instant GENERATED_AT =
            Instant.parse("2026-09-07T02:00:00Z");
    private static final String SOURCE_HASH = "a".repeat(64);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ResearchTaskExportArtifactGenerator generator =
            new ResearchTaskExportArtifactGenerator(
                    objectMapper,
                    Clock.fixed(GENERATED_AT, ZoneOffset.UTC));

    @Test
    void createsResearchZipWithIdentityResultsSummaryAndPredictions()
            throws Exception {
        TaskResultViewV1 view = view();
        ResearchTaskExportParticipant participant =
                new ResearchTaskExportParticipant(
                        new TaskSubmissionId(new UUID(0, 10)),
                        "user-1",
                        "persona-1",
                        TaskPredictionStatus.SUCCEEDED,
                        "candidate-policy/v1",
                        List.of(new PredictionCandidate(
                                1, 2, "AI 예상 사유", true)));

        ResearchTaskExportArtifact artifact = generator.generate(
                TASK_ID,
                verified(view),
                new TaskResultSummaryAssembler().assemble(view),
                List.of(participant));

        Map<String, byte[]> files = unzip(artifact.content());
        assertThat(files.keySet()).containsExactly(
                "metadata.json",
                "result-view.jsonl",
                "result-summary.json",
                "predictions.jsonl");
        assertThat(artifact.participantCount()).isEqualTo(1);
        assertThat(artifact.predictionCount()).isEqualTo(1);
        assertThat(artifact.taskTitle()).isEqualTo("연구 과업");

        JsonNode metadata = objectMapper.readTree(files.get("metadata.json"));
        assertThat(metadata.get("schemaVersion").asText())
                .isEqualTo("research-task-export/v1");
        assertThat(metadata.get("generatedAt").asText())
                .isEqualTo(GENERATED_AT.toString());
        assertThat(metadata.get("identity")
                .get("containsDirectIdentifiers").asBoolean()).isTrue();
        assertThat(metadata.get("counts")
                .get("predictionCandidateCount").asInt()).isEqualTo(1);

        String resultView = new String(
                files.get("result-view.jsonl"),
                java.nio.charset.StandardCharsets.UTF_8);
        assertThat(resultView)
                .contains("\"schemaVersion\":\"research-task-result-view/v1\"")
                .contains("\"participantKey\":\"P1\"")
                .contains("\"userId\":\"user-1\"")
                .contains("\"personaId\":\"persona-1\"")
                .doesNotContain("personaGenerationId");

        String predictions = new String(
                files.get("predictions.jsonl"),
                java.nio.charset.StandardCharsets.UTF_8);
        assertThat(predictions)
                .contains("\"candidateKey\":\"C1\"")
                .contains("\"optionKey\":\"O2\"")
                .contains("\"acceptedCandidateKey\":\"C1\"");

        JsonNode summary = objectMapper.readTree(
                files.get("result-summary.json"));
        assertThat(summary.get("responseCount").asInt()).isEqualTo(1);
        assertThat(summary.get("options").get(1)
                .get("count").asInt()).isEqualTo(1);
    }

    private static TaskResultViewV1 view() {
        return new TaskResultViewV1(
                1,
                CLOSED_AT,
                TaskClosureType.DEADLINE_REACHED,
                new TaskData("연구 과업", "과업 설명"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 선택을 하시겠어요?",
                        null),
                List.of(
                        new OptionData(1, "첫 번째"),
                        new OptionData(2, "두 번째")),
                List.of(new ResponseData(
                        1,
                        2,
                        "AI 예상 사유",
                        TaskReasonSource.AI_ACCEPTED)));
    }

    private static VerifiedTaskResultView verified(
            TaskResultViewV1 view
    ) {
        TaskResultManifest manifest = new TaskResultManifest(
                TASK_ID,
                1,
                TaskResultViewV1.SCHEMA_VERSION,
                CLOSED_AT,
                1,
                SOURCE_HASH,
                CLOSED_AT.plusSeconds(1));
        return new VerifiedTaskResultView(
                manifest,
                view,
                new RenderedTaskResultView("source", SOURCE_HASH));
    }

    private static Map<String, byte[]> unzip(byte[] content)
            throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(
                new ByteArrayInputStream(content))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                ByteArrayOutputStream value = new ByteArrayOutputStream();
                zip.transferTo(value);
                files.put(entry.getName(), value.toByteArray());
            }
        }
        return files;
    }
}
