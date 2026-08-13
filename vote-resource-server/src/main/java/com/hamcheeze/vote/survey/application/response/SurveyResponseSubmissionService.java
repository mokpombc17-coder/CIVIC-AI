package com.hamcheeze.vote.survey.application.response;

import com.hamcheeze.vote.survey.application.idempotency.IdempotentSurveySubmissionExecutor;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyCommand;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyExecution;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyKey;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyOperation;
import com.hamcheeze.vote.survey.application.idempotency.SurveySubmissionRequestHashFactory;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import com.hamcheeze.vote.survey.domain.common.SurveyViolation;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveySubmissionPolicy;
import com.hamcheeze.vote.survey.domain.response.SurveySubmissionResult;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class SurveyResponseSubmissionService {

    private final IdempotentSurveySubmissionExecutor idempotency;
    private final SurveySubmissionOutcomeCodec outcomeCodec;
    private final SurveyRoundRepository rounds;
    private final SurveyContentVersionRepository contents;
    private final SurveyResponseRepository responses;
    private final SurveySubmissionRequestHashFactory requestHashFactory =
            new SurveySubmissionRequestHashFactory();
    private final SurveySubmissionPolicy submissionPolicy =
            new SurveySubmissionPolicy();
    private final Clock clock;

    @Autowired
    public SurveyResponseSubmissionService(
            IdempotentSurveySubmissionExecutor idempotency,
            SurveySubmissionOutcomeCodec outcomeCodec,
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            SurveyResponseRepository responses
    ) {
        this(idempotency, outcomeCodec, rounds, contents, responses,
                Clock.systemUTC());
    }

    SurveyResponseSubmissionService(
            IdempotentSurveySubmissionExecutor idempotency,
            SurveySubmissionOutcomeCodec outcomeCodec,
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            SurveyResponseRepository responses,
            Clock clock
    ) {
        this.idempotency = Objects.requireNonNull(
                idempotency, "idempotency");
        this.outcomeCodec = Objects.requireNonNull(
                outcomeCodec, "outcomeCodec");
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.contents = Objects.requireNonNull(contents, "contents");
        this.responses = Objects.requireNonNull(responses, "responses");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public SubmissionExecution submit(
            SurveyUserId authenticatedUserId,
            String idempotencyKey,
            SubmitSurveyResponseCommand command
    ) {
        Objects.requireNonNull(authenticatedUserId, "authenticatedUserId");
        Objects.requireNonNull(command, "command");
        SurveyIdempotencyCommand receiptCommand =
                new SurveyIdempotencyCommand(
                        authenticatedUserId,
                        SurveyIdempotencyOperation.SUBMIT_SURVEY_RESPONSE,
                        SurveyIdempotencyKey.parse(idempotencyKey),
                        requestHashFactory.hash(
                                command.roundId(), command.answers()),
                        SurveySubmissionOutcomeCodec.SCHEMA_VERSION);
        SurveyIdempotencyExecution<SurveySubmissionOutcome> execution =
                idempotency.execute(
                        receiptCommand,
                        outcomeCodec,
                        () -> submitInReceiptTransaction(
                                authenticatedUserId, command));
        return new SubmissionExecution(
                execution.result(), execution.replayed());
    }

    private SurveySubmissionOutcome submitInReceiptTransaction(
            SurveyUserId userId,
            SubmitSurveyResponseCommand command
    ) {
        SurveyRound lockedRound = rounds
                .findByIdForShare(command.roundId())
                .orElse(null);
        if (lockedRound == null) {
            return rejection(
                    409,
                    "SURVEY_SUBMISSION_ROUND_CHANGED",
                    command.roundId(),
                    SurveyViolation.of(
                            "SURVEY_SUBMISSION_ROUND_CHANGED",
                            "roundId",
                            "requested round is no longer active"));
        }
        SurveyContentVersion content = contents
                .findById(lockedRound.contentVersionId())
                .orElse(null);
        if (content == null) {
            return rejection(
                    409,
                    "SURVEY_SUBMISSION_CONTENT_UNAVAILABLE",
                    command.roundId(),
                    SurveyViolation.of(
                            "SURVEY_SUBMISSION_CONTENT_UNAVAILABLE",
                            "contentVersionId",
                            "round content version is unavailable"));
        }
        boolean existing = responses.existsByUserIdAndRoundId(
                userId, lockedRound.id());
        try {
            SurveySubmissionResult result =
                    submissionPolicy.submitFinalResponse(
                            new SurveyResponseId(UUID.randomUUID()),
                            userId,
                            command.roundId(),
                            lockedRound,
                            content,
                            existing,
                            command.answers(),
                            clock.instant());
            responses.insert(result.response());
            return SurveySubmissionOutcome.submitted(result.event());
        } catch (SurveyValidationException exception) {
            return SurveySubmissionOutcome.rejected(
                    422,
                    "SURVEY_RESPONSE_VALIDATION_FAILED",
                    command.roundId(),
                    exception.violations());
        } catch (SurveyDomainException exception) {
            SurveyViolation violation = exception.violation();
            String code = publicCode(violation.code());
            return rejection(
                    conflictStatus(code),
                    code,
                    command.roundId(),
                    new SurveyViolation(
                            code,
                            violation.path(),
                            violation.message(),
                            violation.details()));
        }
    }

    private static SurveySubmissionOutcome rejection(
            int status,
            String code,
            SurveyRoundId roundId,
            SurveyViolation violation
    ) {
        return SurveySubmissionOutcome.rejected(
                status, code, roundId, List.of(violation));
    }

    private static String publicCode(String domainCode) {
        if ("SURVEY_RESPONSE_ALREADY_SUBMITTED".equals(domainCode)) {
            return "CURRENT_SURVEY_ALREADY_SUBMITTED";
        }
        if ("SURVEY_SUBMISSION_ACTIVE_ROUND_REQUIRED".equals(domainCode)) {
            return "SURVEY_SUBMISSION_ROUND_CHANGED";
        }
        return domainCode;
    }

    private static int conflictStatus(String code) {
        return 409;
    }

    public record SubmitSurveyResponseCommand(
            SurveyRoundId roundId,
            List<SurveyAnswer> answers
    ) {
        public SubmitSurveyResponseCommand {
            Objects.requireNonNull(roundId, "roundId");
            answers = List.copyOf(Objects.requireNonNull(
                    answers, "answers"));
        }
    }

    public record SubmissionExecution(
            SurveySubmissionOutcome outcome,
            boolean replayed
    ) {
        public SubmissionExecution {
            Objects.requireNonNull(outcome, "outcome");
        }
    }
}
