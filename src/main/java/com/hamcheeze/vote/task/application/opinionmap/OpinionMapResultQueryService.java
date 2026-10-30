package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.result.MyTaskOpinionMap;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;

@Service
public class OpinionMapResultQueryService {

    private final OpinionMapGenerationRepository generations;
    private final OpinionMapGenerationOutputReader outputs;

    public OpinionMapResultQueryService(
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationOutputReader outputs
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.outputs = Objects.requireNonNull(outputs, "outputs");
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
                    outputs.read(generation), selectedOptionDisplayOrder);
        };
    }
}
