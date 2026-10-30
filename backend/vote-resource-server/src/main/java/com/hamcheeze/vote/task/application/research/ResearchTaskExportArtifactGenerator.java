package com.hamcheeze.vote.task.application.research;

import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.application.research.ResearchTaskExportParticipant.PredictionCandidate;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.VerifiedTaskResultView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Component
public class ResearchTaskExportArtifactGenerator {

    private static final String RESULT_VIEW_FILE = "result-view.jsonl";
    private static final String RESULT_SUMMARY_FILE = "result-summary.json";
    private static final String PREDICTIONS_FILE = "predictions.jsonl";
    private static final String METADATA_FILE = "metadata.json";
    private static final String RESULT_VIEW_SCHEMA =
            "research-task-result-view/v1";
    private static final String PREDICTIONS_SCHEMA =
            "research-task-predictions/v1";

    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public ResearchTaskExportArtifactGenerator(ObjectMapper objectMapper) {
        this(objectMapper, Clock.systemUTC());
    }

    ResearchTaskExportArtifactGenerator(
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public ResearchTaskExportArtifact generate(
            TaskId taskId,
            VerifiedTaskResultView verified,
            TaskResultSummaryV1 summary,
            List<ResearchTaskExportParticipant> participants
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(verified, "verified");
        Objects.requireNonNull(summary, "summary");
        List<ResearchTaskExportParticipant> immutableParticipants =
                List.copyOf(Objects.requireNonNull(
                        participants, "participants"));
        if (verified.view().responses().size()
                != immutableParticipants.size()) {
            throw integrity(taskId, "research response identity mismatch");
        }

        byte[] resultView = resultView(
                taskId, verified.view(), immutableParticipants);
        byte[] resultSummary = jsonFile(summary);
        byte[] predictions = predictions(
                taskId, immutableParticipants);
        byte[] metadata = metadata(
                taskId,
                verified,
                immutableParticipants,
                resultView,
                resultSummary,
                predictions);
        byte[] zip = zip(Map.of(
                METADATA_FILE, metadata,
                RESULT_VIEW_FILE, resultView,
                RESULT_SUMMARY_FILE, resultSummary,
                PREDICTIONS_FILE, predictions));
        int predictionCount = (int) immutableParticipants.stream()
                .filter(ResearchTaskExportParticipant::hasPrediction)
                .count();
        return new ResearchTaskExportArtifact(
                verified.view().task().title(),
                zip,
                sha256(zip),
                immutableParticipants.size(),
                predictionCount);
    }

    private byte[] resultView(
            TaskId taskId,
            TaskResultViewV1 view,
            List<ResearchTaskExportParticipant> participants
    ) {
        List<String> bodyLines = new ArrayList<>();
        bodyLines.add(json(taskLine(view)));
        bodyLines.add(json(questionLine(view)));
        for (OptionData option : view.options()) {
            bodyLines.add(json(optionLine(option)));
        }
        for (int index = 0; index < view.responses().size(); index++) {
            ResponseData response = view.responses().get(index);
            ResearchTaskExportParticipant participant =
                    participants.get(index);
            requireAcceptedPrediction(taskId, response, participant);
            bodyLines.add(json(responseLine(response, participant)));
        }
        String body = String.join("\n", bodyLines) + "\n";
        Map<String, Object> manifest = line("manifest");
        manifest.put("schemaVersion", RESULT_VIEW_SCHEMA);
        manifest.put("sourceSchemaVersion", TaskResultViewV1.SCHEMA_VERSION);
        manifest.put("taskId", taskId.value().toString());
        manifest.put("resultVersion", view.resultVersion());
        manifest.put("closedAt", view.closedAt().toString());
        manifest.put("closureType", view.closureType().name());
        manifest.put("optionCount", view.options().size());
        manifest.put("responseCount", view.responses().size());
        manifest.put("bodySha256", sha256(
                body.getBytes(StandardCharsets.UTF_8)));
        return (json(manifest) + "\n" + body)
                .getBytes(StandardCharsets.UTF_8);
    }

    private Map<String, Object> taskLine(TaskResultViewV1 view) {
        Map<String, Object> values = line("task");
        values.put("title", view.task().title());
        values.put("description", view.task().description());
        return values;
    }

    private Map<String, Object> questionLine(TaskResultViewV1 view) {
        Map<String, Object> values = line("question");
        values.put("questionType", view.question().questionType().name());
        values.put("content", view.question().content());
        values.put("description", view.question().description());
        return values;
    }

    private Map<String, Object> optionLine(OptionData option) {
        Map<String, Object> values = line("option");
        values.put("key", optionKey(option.displayOrder()));
        values.put("displayOrder", option.displayOrder());
        values.put("content", option.content());
        return values;
    }

    private Map<String, Object> responseLine(
            ResponseData response,
            ResearchTaskExportParticipant participant
    ) {
        Map<String, Object> values = line("response");
        values.put("participantKey", participantKey(
                response.participantSequence()));
        values.put("userId", participant.userId());
        values.put("personaId", participant.personaId());
        values.put("selectedOptionKey", optionKey(
                response.selectedOptionDisplayOrder()));
        values.put("reason", response.reason());
        values.put("reasonSource", response.reasonSource().name());
        return values;
    }

    private byte[] predictions(
            TaskId taskId,
            List<ResearchTaskExportParticipant> participants
    ) {
        int predictionCount = (int) participants.stream()
                .filter(ResearchTaskExportParticipant::hasPrediction)
                .count();
        int candidateCount = participants.stream()
                .mapToInt(participant ->
                        participant.predictionCandidates().size())
                .sum();
        List<String> lines = new ArrayList<>();
        Map<String, Object> manifest = line("manifest");
        manifest.put("schemaVersion", PREDICTIONS_SCHEMA);
        manifest.put("taskId", taskId.value().toString());
        manifest.put("participantCount", participants.size());
        manifest.put("predictionCount", predictionCount);
        manifest.put("candidateCount", candidateCount);
        lines.add(json(manifest));

        for (int index = 0; index < participants.size(); index++) {
            ResearchTaskExportParticipant participant =
                    participants.get(index);
            Map<String, Object> values = line("prediction");
            values.put("participantKey", participantKey(index + 1));
            values.put("userId", participant.userId());
            values.put("personaId", participant.personaId());
            values.put("status", participant.hasPrediction()
                    ? participant.predictionStatus().name()
                    : "NOT_AVAILABLE");
            values.put("candidatePolicyVersion",
                    participant.candidatePolicyVersion());
            values.put("candidates", candidates(
                    participant.predictionCandidates()));
            values.put("acceptedCandidateKey", acceptedCandidateKey(
                    participant.predictionCandidates()));
            lines.add(json(values));
        }
        return (String.join("\n", lines) + "\n")
                .getBytes(StandardCharsets.UTF_8);
    }

    private static List<Map<String, Object>> candidates(
            List<PredictionCandidate> candidates
    ) {
        return candidates.stream().map(candidate -> {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("candidateKey", candidateKey(candidate.sequence()));
            value.put("optionKey", optionKey(
                    candidate.optionDisplayOrder()));
            value.put("reason", candidate.reason());
            return value;
        }).toList();
    }

    private static String acceptedCandidateKey(
            List<PredictionCandidate> candidates
    ) {
        return candidates.stream()
                .filter(PredictionCandidate::accepted)
                .findFirst()
                .map(candidate -> candidateKey(candidate.sequence()))
                .orElse(null);
    }

    private byte[] metadata(
            TaskId taskId,
            VerifiedTaskResultView verified,
            List<ResearchTaskExportParticipant> participants,
            byte[] resultView,
            byte[] resultSummary,
            byte[] predictions
    ) {
        int predictionCount = (int) participants.stream()
                .filter(ResearchTaskExportParticipant::hasPrediction)
                .count();
        int candidateCount = participants.stream()
                .mapToInt(participant ->
                        participant.predictionCandidates().size())
                .sum();

        Map<String, Object> task = new LinkedHashMap<>();
        task.put("taskId", taskId.value().toString());
        task.put("resultVersion", verified.view().resultVersion());
        task.put("closedAt", verified.view().closedAt().toString());
        task.put("closureType", verified.view().closureType().name());
        task.put("finalizedAt",
                verified.manifest().finalizedAt().toString());
        task.put("sourceResultSha256",
                verified.manifest().bodySha256());

        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("participantCount", participants.size());
        counts.put("predictionCount", predictionCount);
        counts.put("predictionCandidateCount", candidateCount);

        Map<String, Object> identity = new LinkedHashMap<>();
        identity.put("containsDirectIdentifiers", true);
        identity.put("fields", List.of(
                "participantKey", "userId", "personaId"));

        List<Map<String, Object>> files = List.of(
                file(RESULT_VIEW_FILE,
                        "application/x-ndjson;charset=UTF-8", resultView),
                file(RESULT_SUMMARY_FILE,
                        "application/json;charset=UTF-8", resultSummary),
                file(PREDICTIONS_FILE,
                        "application/x-ndjson;charset=UTF-8", predictions));

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("schemaVersion",
                ResearchTaskExportArtifact.SCHEMA_VERSION);
        metadata.put("generatedAt", Instant.now(clock).toString());
        metadata.put("task", task);
        metadata.put("counts", counts);
        metadata.put("identity", identity);
        metadata.put("files", files);
        return jsonFile(metadata);
    }

    private static Map<String, Object> file(
            String name,
            String contentType,
            byte[] content
    ) {
        Map<String, Object> file = new LinkedHashMap<>();
        file.put("name", name);
        file.put("contentType", contentType);
        file.put("sizeBytes", content.length);
        file.put("sha256", sha256(content));
        return file;
    }

    private byte[] jsonFile(Object value) {
        return (json(value) + "\n").getBytes(StandardCharsets.UTF_8);
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to render research Task export", exception);
        }
    }

    private static byte[] zip(Map<String, byte[]> files) {
        List<String> order = List.of(
                METADATA_FILE,
                RESULT_VIEW_FILE,
                RESULT_SUMMARY_FILE,
                PREDICTIONS_FILE);
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(
                    bytes, StandardCharsets.UTF_8)) {
                for (String name : order) {
                    ZipEntry entry = new ZipEntry(name);
                    entry.setTime(0L);
                    zip.putNextEntry(entry);
                    zip.write(Objects.requireNonNull(files.get(name), name));
                    zip.closeEntry();
                }
            }
            return bytes.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "failed to create research Task export ZIP", exception);
        }
    }

    private static void requireAcceptedPrediction(
            TaskId taskId,
            ResponseData response,
            ResearchTaskExportParticipant participant
    ) {
        long accepted = participant.predictionCandidates().stream()
                .filter(PredictionCandidate::accepted)
                .count();
        if (response.reasonSource() == TaskReasonSource.AI_ACCEPTED
                && accepted != 1) {
            throw integrity(taskId,
                    "AI response does not have one accepted candidate");
        }
        if (response.reasonSource() == TaskReasonSource.USER_WRITTEN
                && accepted != 0) {
            throw integrity(taskId,
                    "user response unexpectedly has an accepted candidate");
        }
    }

    private static Map<String, Object> line(String type) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("type", type);
        return line;
    }

    private static String participantKey(int sequence) {
        return "P" + sequence;
    }

    private static String optionKey(int displayOrder) {
        return "O" + displayOrder;
    }

    private static String candidateKey(int sequence) {
        return "C" + sequence;
    }

    private static String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 algorithm is unavailable", exception);
        }
    }

    private static TaskResultViewIntegrityException integrity(
            TaskId taskId,
            String reason
    ) {
        return new TaskResultViewIntegrityException(taskId, reason);
    }
}
