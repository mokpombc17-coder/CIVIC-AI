package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationPayloadFactory;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Component
public class TaskPreparationJsonPayloadFactory
        implements TaskPreparationPayloadFactory {

    public static final int SCHEMA_VERSION = 1;

    private final ObjectMapper objectMapper;

    public TaskPreparationJsonPayloadFactory(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
    }

    @Override
    public TaskPreparationCommand create(Task task, UUID requestId) {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(requestId, "requestId");
        TaskPayload payload = TaskPayload.from(task);
        String fingerprint = fingerprint(payload);
        String requestPayload = serialize(new PreparationRequest(
                SCHEMA_VERSION, requestId, fingerprint, payload));
        return new TaskPreparationCommand(
                SCHEMA_VERSION,
                requestId,
                task.id(),
                fingerprint,
                requestPayload);
    }

    @Override
    public String fingerprint(Task task) {
        Objects.requireNonNull(task, "task");
        return fingerprint(TaskPayload.from(task));
    }

    private String fingerprint(TaskPayload task) {
        byte[] bytes = serialize(task).getBytes(StandardCharsets.UTF_8);
        try {
            return "sha256:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String serialize(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (RuntimeException exception) {
            throw new IllegalStateException(
                    "Task preparation payload could not be serialized",
                    exception);
        }
    }

    record PreparationRequest(
            int schemaVersion,
            UUID requestId,
            String contentFingerprint,
            TaskPayload task
    ) {
    }

    record TaskPayload(
            UUID taskId,
            String title,
            String description,
            List<QuestionPayload> questions
    ) {
        static TaskPayload from(Task task) {
            return new TaskPayload(
                    task.id().value(),
                    task.title(),
                    task.description(),
                    task.questions().stream()
                            .map(QuestionPayload::from)
                            .toList());
        }
    }

    record QuestionPayload(
            UUID questionId,
            String content,
            String description,
            List<OptionPayload> options
    ) {
        static QuestionPayload from(TaskQuestion question) {
            return new QuestionPayload(
                    question.id().value(),
                    question.content(),
                    question.description(),
                    question.options().stream()
                            .map(OptionPayload::from)
                            .toList());
        }
    }

    record OptionPayload(UUID optionId, String content) {
        static OptionPayload from(TaskOption option) {
            return new OptionPayload(option.id().value(), option.content());
        }
    }
}
