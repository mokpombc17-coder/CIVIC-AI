package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.result.MyTaskOpinionMap;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;
import java.util.Optional;

@Service
public class OpinionMapResultQueryService {

    private final OpinionMapGenerationRepository generations;
    private final ObjectMapper objectMapper;

    public OpinionMapResultQueryService(
            OpinionMapGenerationRepository generations,
            ObjectMapper objectMapper
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
    }

    @Transactional(readOnly = true)
    public MyTaskOpinionMap findForTask(
            TaskId taskId,
            int resultVersion,
            int selectedOptionDisplayOrder
    ) {
        Optional<OpinionMapGeneration> found =
                generations.findByTaskResult(taskId, resultVersion);
        if (found.isEmpty()) {
            return MyTaskOpinionMap.unavailable();
        }
        OpinionMapGeneration generation = found.orElseThrow();
        return switch (generation.status()) {
            case PENDING, PROCESSING, RETRY_WAIT ->
                    MyTaskOpinionMap.pending();
            case UNAVAILABLE -> MyTaskOpinionMap.unavailable();
            case AVAILABLE -> MyTaskOpinionMap.available(
                    readOutput(generation), selectedOptionDisplayOrder);
        };
    }

    private OpinionMapOptionExplanationV1 readOutput(
            OpinionMapGeneration generation
    ) {
        try {
            OpinionMapOptionExplanationV1 output = objectMapper.readValue(
                    generation.outputJson(),
                    OpinionMapOptionExplanationV1.class);
            if (!output.taskId().equals(generation.taskId().value())
                    || output.resultVersion() != generation.resultVersion()) {
                throw new IllegalStateException(
                        "stored Opinion Map output identity does not match");
            }
            return output;
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "stored Opinion Map output is invalid", exception);
        }
    }
}
