package com.hamcheeze.vote.task.infra.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer;
import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer.RenderedTaskResultForLlm;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmDocument;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1.ResponseData;
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

/** Renders the byte-stable task-result-for-llm/v1 NDJSON contract. */
@Component
public class TaskResultForLlmV1JsonlWriter
        implements TaskResultForLlmRenderer {

    public static final String CONTENT_TYPE =
            TaskResultForLlmDocument.CONTENT_TYPE;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public RenderedTaskResultForLlm render(TaskResultForLlmV1 export) {
        Objects.requireNonNull(export, "export");
        List<String> bodyLines = new ArrayList<>();
        bodyLines.add(taskLine(export));
        bodyLines.add(questionLine(export));
        for (OptionData option : export.options()) {
            bodyLines.add(optionLine(option));
        }
        for (ResponseData response : export.responses()) {
            bodyLines.add(responseLine(response));
        }

        String body = String.join("\n", bodyLines) + "\n";
        String bodySha256 = sha256(body);
        String content = manifestLine(export, bodySha256)
                + "\n"
                + body;
        return new RenderedTaskResultForLlm(content, bodySha256);
    }

    private String manifestLine(
            TaskResultForLlmV1 export,
            String bodySha256
    ) {
        Map<String, Object> values = line("manifest");
        values.put("schemaVersion", TaskResultForLlmV1.SCHEMA_VERSION);
        values.put("taskId", export.taskId().value().toString());
        values.put("sourceSchemaVersion", export.sourceSchemaVersion());
        values.put("resultVersion", export.resultVersion());
        values.put("optionCount", export.options().size());
        values.put("responseCount", export.responses().size());
        values.put("sourceBodySha256", export.sourceBodySha256());
        values.put("bodySha256", bodySha256);
        return json(values);
    }

    private String taskLine(TaskResultForLlmV1 export) {
        Map<String, Object> values = line("task");
        values.put("title", export.task().title());
        values.put("background", export.task().description());
        return json(values);
    }

    private String questionLine(TaskResultForLlmV1 export) {
        Map<String, Object> values = line("question");
        values.put("questionType", export.question().questionType().name());
        values.put("content", export.question().content());
        values.put("description", export.question().description());
        return json(values);
    }

    private String optionLine(OptionData option) {
        Map<String, Object> values = line("option");
        values.put("key", option.key());
        values.put("displayOrder", option.displayOrder());
        values.put("content", option.content());
        return json(values);
    }

    private String responseLine(ResponseData response) {
        Map<String, Object> values = line("response");
        values.put("responseRef", response.responseRef());
        values.put("selectedOptionKey", response.selectedOptionKey());
        values.put("reason", response.reason());
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
                    "failed to render task-result-for-llm/v1", exception);
        }
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
}
