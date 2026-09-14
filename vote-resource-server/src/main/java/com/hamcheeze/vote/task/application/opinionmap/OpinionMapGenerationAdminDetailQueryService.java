package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView.Area;
import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView.AreaStatus;
import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView.OptionView;
import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView.Status;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.OptionSummary;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class OpinionMapGenerationAdminDetailQueryService {

    private final TaskRepository tasks;
    private final TaskResultManifestRepository manifests;
    private final TaskResultSummaryQueryService summaries;
    private final OpinionMapGenerationRepository generations;
    private final OpinionMapGenerationOutputReader outputs;
    private final OpinionMapGenerationPolicy policy;

    public OpinionMapGenerationAdminDetailQueryService(
            TaskRepository tasks,
            TaskResultManifestRepository manifests,
            TaskResultSummaryQueryService summaries,
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationOutputReader outputs,
            OpinionMapGenerationPolicy policy
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.manifests = Objects.requireNonNull(manifests, "manifests");
        this.summaries = Objects.requireNonNull(summaries, "summaries");
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.outputs = Objects.requireNonNull(outputs, "outputs");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    @Transactional(readOnly = true)
    public Optional<AdminOpinionMapGenerationView> findByTaskId(
            TaskId taskId
    ) {
        Objects.requireNonNull(taskId, "taskId");
        return tasks.findById(taskId).map(this::assemble);
    }

    private AdminOpinionMapGenerationView assemble(Task task) {
        if (!task.resultEligible()) {
            return empty(
                    task, null, Status.NOT_ELIGIBLE, false,
                    optionsWithoutCounts(task));
        }

        Optional<TaskResultManifest> foundManifest =
                manifests.findByTaskId(task.id());
        if (foundManifest.isEmpty()) {
            return empty(
                    task, null, Status.NOT_CREATED, policy.enabled(),
                    optionsWithoutCounts(task));
        }

        TaskResultManifest manifest = foundManifest.orElseThrow();
        TaskResultSummaryV1 summary = summaries.findByTaskId(task.id())
                .orElseThrow(() -> integrity(
                        task.id(), "finalized result summary is missing"));
        verifySummary(manifest, summary);
        Optional<OpinionMapGeneration> foundGeneration =
                generations.findByTaskResult(
                        task.id(), manifest.resultVersion());
        if (foundGeneration.isEmpty()) {
            return empty(
                    task,
                    manifest.resultVersion(),
                    Status.NOT_CREATED,
                    policy.enabled(),
                    options(task, summary, null));
        }

        OpinionMapGeneration generation = foundGeneration.orElseThrow();
        if (!generation.sourceBodySha256().equals(manifest.bodySha256())) {
            throw integrity(task.id(),
                    "Opinion Map source does not match finalized result");
        }
        Status status = Status.valueOf(generation.status().name());
        OpinionMapOptionExplanationV1 output =
                status == Status.AVAILABLE
                        ? readOutput(task.id(), generation)
                        : null;
        return new AdminOpinionMapGenerationView(
                task.id(),
                manifest.resultVersion(),
                status,
                generation.attemptCount(),
                generation.lastErrorCode(),
                generation.nextAttemptAt(),
                generation.processingStartedAt(),
                generation.completedAt(),
                generation.updatedAt(),
                false,
                status == Status.UNAVAILABLE && policy.enabled(),
                options(task, summary, output));
    }

    private OpinionMapOptionExplanationV1 readOutput(
            TaskId taskId,
            OpinionMapGeneration generation
    ) {
        try {
            return outputs.read(generation);
        } catch (IllegalStateException exception) {
            throw new TaskResultViewIntegrityException(
                    taskId,
                    "stored Opinion Map output is invalid",
                    exception);
        }
    }

    private static AdminOpinionMapGenerationView empty(
            Task task,
            Integer resultVersion,
            Status status,
            boolean canGenerate,
            List<OptionView> options
    ) {
        return new AdminOpinionMapGenerationView(
                task.id(), resultVersion, status, 0,
                null, null, null, null, null,
                canGenerate, false, options);
    }

    private static List<OptionView> optionsWithoutCounts(Task task) {
        return taskOptions(task).stream()
                .map(option -> new OptionView(
                        option.id(), option.displayOrder(), option.content(),
                        null, null, null))
                .toList();
    }

    private static List<OptionView> options(
            Task task,
            TaskResultSummaryV1 summary,
            OpinionMapOptionExplanationV1 output
    ) {
        Map<String, OptionCount> counts = summary.options().stream()
                .collect(Collectors.toUnmodifiableMap(
                        OptionCount::key,
                        Function.identity()));
        Map<String, OptionSummary> explanations = output == null
                ? Map.of()
                : output.optionSummaries().stream()
                .collect(Collectors.toUnmodifiableMap(
                        OptionSummary::optionKey,
                        Function.identity()));
        List<TaskOption> taskOptions = taskOptions(task);
        if (counts.size() != taskOptions.size()
                || (output != null
                && explanations.size() != taskOptions.size())) {
            throw integrity(task.id(),
                    "Opinion Map option count does not match Task result");
        }

        return taskOptions.stream()
                .map(option -> option(
                        task.id(), option, counts, explanations, output))
                .toList();
    }

    private static OptionView option(
            TaskId taskId,
            TaskOption option,
            Map<String, OptionCount> counts,
            Map<String, OptionSummary> explanations,
            OpinionMapOptionExplanationV1 output
    ) {
        String key = "O" + option.displayOrder();
        OptionCount count = Optional.ofNullable(counts.get(key))
                .orElseThrow(() -> integrity(
                        taskId, "Task result option is missing: " + key));
        if (!option.content().equals(count.content())) {
            throw integrity(taskId,
                    "Task result option content does not match: " + key);
        }
        OptionSummary explanation = output == null
                ? null
                : Optional.ofNullable(explanations.get(key))
                .orElseThrow(() -> integrity(
                        taskId, "Opinion Map option is missing: " + key));
        return new OptionView(
                option.id(),
                option.displayOrder(),
                option.content(),
                count.count(),
                explanation == null ? null : area(explanation.sameChoice()),
                explanation == null
                        ? null : area(explanation.otherChoices()));
    }

    private static Area area(
            OpinionMapOptionExplanationV1.AreaSummary source
    ) {
        return new Area(
                AreaStatus.valueOf(source.status().name()),
                source.body());
    }

    private static List<TaskOption> taskOptions(Task task) {
        return task.questions().getFirst().options().stream()
                .sorted(Comparator.comparingInt(TaskOption::displayOrder))
                .toList();
    }

    private static void verifySummary(
            TaskResultManifest manifest,
            TaskResultSummaryV1 summary
    ) {
        if (summary.resultVersion() != manifest.resultVersion()
                || summary.responseCount() != manifest.responseCount()) {
            throw integrity(manifest.taskId(),
                    "Task result summary does not match manifest");
        }
    }

    private static TaskResultViewIntegrityException integrity(
            TaskId taskId,
            String reason
    ) {
        return new TaskResultViewIntegrityException(taskId, reason);
    }
}
