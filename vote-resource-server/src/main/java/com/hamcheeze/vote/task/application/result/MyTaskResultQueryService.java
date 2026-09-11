package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService.MyTaskSubmission;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class MyTaskResultQueryService {

    private final MyTaskSubmissionQueryService submissions;
    private final TaskResultViewVerificationService verification;
    private final TaskResultSummaryAssembler summaries;

    public MyTaskResultQueryService(
            MyTaskSubmissionQueryService submissions,
            TaskResultViewVerificationService verification,
            TaskResultSummaryAssembler summaries
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.verification = Objects.requireNonNull(
                verification, "verification");
        this.summaries = Objects.requireNonNull(summaries, "summaries");
    }

    @Transactional(readOnly = true)
    public Optional<MyTaskResult> findByTask(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        Optional<MyTaskSubmission> submission =
                submissions.findByTask(userId, taskId);
        if (submission.isEmpty()) {
            return Optional.empty();
        }
        return verification.findByTaskId(taskId)
                .map(verified -> assemble(
                        taskId, submission.orElseThrow(), verified));
    }

    private MyTaskResult assemble(
            TaskId taskId,
            MyTaskSubmission submission,
            VerifiedTaskResultView verified
    ) {
        TaskResultManifest manifest = verified.manifest();
        TaskResultViewV1 view = verified.view();
        TaskResultSummaryV1 summary = summaries.assemble(view);
        verifySubmissionTask(taskId, submission, view);
        List<ResultOption> options = options(
                taskId, submission, view, summary);
        return new MyTaskResult(
                taskId,
                view.task().title(),
                view.task().description(),
                view.closedAt(),
                view.closureType(),
                summary.resultVersion(),
                manifest.finalizedAt(),
                summary.responseCount(),
                new ResultQuestion(
                        submission.questionId(),
                        view.question().content(),
                        view.question().description()),
                options,
                new ResultSubmission(
                        submission.submissionId(),
                        submission.selectedOptionId(),
                        submission.reasonSource(),
                        submission.finalReason(),
                        submission.submittedAt()),
                MyTaskOpinionMap.unavailable());
    }

    private static void verifySubmissionTask(
            TaskId taskId,
            MyTaskSubmission submission,
            TaskResultViewV1 view
    ) {
        TaskQuestion question = submission.question();
        if (!taskId.equals(submission.taskId())
                || !Objects.equals(submission.taskTitle(), view.task().title())
                || !Objects.equals(
                        submission.taskDescription(),
                        view.task().description())
                || question.type() != view.question().questionType()
                || !Objects.equals(
                        question.content(), view.question().content())
                || !Objects.equals(
                        question.description(),
                        view.question().description())) {
            throw integrity(taskId, "submission task does not match result");
        }
    }

    private static List<ResultOption> options(
            TaskId taskId,
            MyTaskSubmission submission,
            TaskResultViewV1 view,
            TaskResultSummaryV1 summary
    ) {
        List<TaskOption> taskOptions = submission.question().options();
        List<OptionData> viewOptions = view.options();
        List<OptionCount> counts = summary.options();
        if (taskOptions.size() != viewOptions.size()
                || taskOptions.size() != counts.size()) {
            throw integrity(taskId, "result option sizes do not match");
        }
        List<ResultOption> result = new ArrayList<>(taskOptions.size());
        for (int index = 0; index < taskOptions.size(); index++) {
            TaskOption taskOption = taskOptions.get(index);
            OptionData viewOption = viewOptions.get(index);
            OptionCount count = counts.get(index);
            if (taskOption.displayOrder() != viewOption.displayOrder()
                    || !Objects.equals(
                            taskOption.content(), viewOption.content())
                    || !Objects.equals(
                            taskOption.content(), count.content())) {
                throw integrity(taskId, "result options do not match task");
            }
            result.add(new ResultOption(
                    taskOption.id(),
                    taskOption.displayOrder(),
                    taskOption.content(),
                    count.count(),
                    taskOption.id().equals(
                            submission.selectedOptionId())));
        }
        long selectedCount = result.stream()
                .filter(ResultOption::selectedByMe)
                .count();
        if (selectedCount != 1) {
            throw integrity(taskId, "submission option does not exist");
        }
        return List.copyOf(result);
    }

    private static TaskResultViewIntegrityException integrity(
            TaskId taskId,
            String reason
    ) {
        return new TaskResultViewIntegrityException(taskId, reason);
    }

    public record MyTaskResult(
            TaskId taskId,
            String title,
            String description,
            Instant closedAt,
            TaskClosureType closureType,
            int resultVersion,
            Instant finalizedAt,
            int responseCount,
            ResultQuestion question,
            List<ResultOption> options,
            ResultSubmission mySubmission,
            MyTaskOpinionMap opinionMap
    ) {
        public MyTaskResult {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(closedAt, "closedAt");
            Objects.requireNonNull(closureType, "closureType");
            if (resultVersion < 1) {
                throw new IllegalArgumentException(
                        "resultVersion must be positive");
            }
            Objects.requireNonNull(finalizedAt, "finalizedAt");
            if (responseCount < 0) {
                throw new IllegalArgumentException(
                        "responseCount must not be negative");
            }
            Objects.requireNonNull(question, "question");
            options = List.copyOf(Objects.requireNonNull(options, "options"));
            Objects.requireNonNull(mySubmission, "mySubmission");
            Objects.requireNonNull(opinionMap, "opinionMap");
        }
    }

    public record ResultQuestion(
            TaskQuestionId id,
            String content,
            String description
    ) {
        public ResultQuestion {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(content, "content");
        }
    }

    public record ResultOption(
            TaskOptionId id,
            int displayOrder,
            String content,
            int count,
            boolean selectedByMe
    ) {
        public ResultOption {
            Objects.requireNonNull(id, "id");
            if (displayOrder < 1) {
                throw new IllegalArgumentException(
                        "displayOrder must be positive");
            }
            Objects.requireNonNull(content, "content");
            if (count < 0) {
                throw new IllegalArgumentException(
                        "count must not be negative");
            }
        }
    }

    public record ResultSubmission(
            TaskSubmissionId submissionId,
            TaskOptionId selectedOptionId,
            TaskReasonSource reasonSource,
            String finalReason,
            Instant submittedAt
    ) {
        public ResultSubmission {
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(selectedOptionId, "selectedOptionId");
            Objects.requireNonNull(reasonSource, "reasonSource");
            Objects.requireNonNull(finalReason, "finalReason");
            Objects.requireNonNull(submittedAt, "submittedAt");
        }
    }
}
