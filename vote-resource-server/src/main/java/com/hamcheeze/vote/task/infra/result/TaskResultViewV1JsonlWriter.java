package com.hamcheeze.vote.task.infra.result;

import com.hamcheeze.vote.task.application.result.TaskResultViewV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Renders the byte-stable task-result-view/v1 NDJSON contract. */
@Component
public class TaskResultViewV1JsonlWriter {

    public static final String CONTENT_TYPE =
            "application/x-ndjson; charset=utf-8";

    private final ObjectMapper objectMapper = new ObjectMapper();

    public RenderedTaskResultView render(TaskResultViewV1 view) {
        Objects.requireNonNull(view, "view");
        List<String> bodyLines = new ArrayList<>();
        bodyLines.add(taskLine(view));
        bodyLines.add(questionLine(view));
        for (OptionData option : view.options()) {
            bodyLines.add(optionLine(option));
        }
        for (ResponseData response : view.responses()) {
            bodyLines.add(responseLine(response));
        }

        String body = String.join("\n", bodyLines) + "\n";
        String bodySha256 = sha256(body);
        String content = manifestLine(view, bodySha256)
                + "\n"
                + body;
        return new RenderedTaskResultView(content, bodySha256);
    }

    private String manifestLine(
            TaskResultViewV1 view,
            String bodySha256
    ) {
        Map<String, Object> values = line("manifest");
        values.put("schemaVersion", TaskResultViewV1.SCHEMA_VERSION);
        values.put("resultVersion", view.resultVersion());
        values.put("closedAt", view.closedAt().toString());
        values.put("closureType", view.closureType().name());
        values.put("optionCount", view.options().size());
        values.put("responseCount", view.responses().size());
        values.put("bodySha256", bodySha256);
        return json(values);
    }

    private String taskLine(TaskResultViewV1 view) {
        Map<String, Object> values = line("task");
        values.put("title", view.task().title());
        values.put("description", view.task().description());
        return json(values);
    }

    private String questionLine(TaskResultViewV1 view) {
        Map<String, Object> values = line("question");
        values.put("questionType", view.question().questionType().name());
        values.put("content", view.question().content());
        values.put("description", view.question().description());
        return json(values);
    }

    private String optionLine(OptionData option) {
        Map<String, Object> values = line("option");
        values.put("key", optionKey(option.displayOrder()));
        values.put("displayOrder", option.displayOrder());
        values.put("content", option.content());
        return json(values);
    }

    private String responseLine(ResponseData response) {
        Map<String, Object> values = line("response");
        values.put("key", responseKey(response.sequence()));
        values.put(
                "selectedOptionKey",
                optionKey(response.selectedOptionDisplayOrder()));
        values.put("reason", response.reason());
        values.put("reasonSource", response.reasonSource().name());
        values.put("submittedAt", response.submittedAt().toString());
        return json(values);
    }

    private static Map<String, Object> line(String type) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("type", type);
        return values;
    }

    private String json(Map<String, Object> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to render task-result-view/v1", exception);
        }
    }

    private static String optionKey(int displayOrder) {
        return "O" + displayOrder;
    }

    private static String responseKey(int sequence) {
        return "R%06d".formatted(sequence);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(
                            value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 algorithm is unavailable", exception);
        }
    }

    public record RenderedTaskResultView(
            String content,
            String bodySha256
    ) {

        public RenderedTaskResultView {
            Objects.requireNonNull(content, "content");
            Objects.requireNonNull(bodySha256, "bodySha256");
        }
    }
}
