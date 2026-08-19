package com.hamcheeze.vote.opinionmap.application.finalization;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapFinalizationRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalization;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class OpinionMapFinalizationCoordinator {

    private final OpinionMapFinalizationRepository finalizations;
    private final OpinionMapSubmissionProjectionRepository submissions;
    private final Clock clock;

    @Autowired
    public OpinionMapFinalizationCoordinator(
            OpinionMapFinalizationRepository finalizations,
            OpinionMapSubmissionProjectionRepository submissions
    ) {
        this(finalizations, submissions, Clock.systemUTC());
    }

    OpinionMapFinalizationCoordinator(
            OpinionMapFinalizationRepository finalizations,
            OpinionMapSubmissionProjectionRepository submissions,
            Clock clock
    ) {
        this.finalizations = Objects.requireNonNull(
                finalizations, "finalizations");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public OpinionMapFinalization register(
            OpinionMapFinalizationRequest request
    ) {
        Objects.requireNonNull(request, "request");
        finalizations.lockTask(request.taskId());
        OpinionMapFinalization assessed = assess(request);
        if (finalizations.insertIfAbsent(assessed)) {
            return assessed;
        }

        OpinionMapFinalization existing = finalizations
                .findByTaskIdForUpdate(request.taskId())
                .orElseThrow(() -> new IllegalStateException(
                        "opinion map finalization is unavailable after conflict"));
        if (!existing.hasSameRequest(request)) {
            throw new OpinionMapFinalizationRequestConflictException(
                    request.taskId());
        }
        return reassessAndSave(existing);
    }

    @Transactional
    public Optional<OpinionMapFinalization> reassess(UUID taskId) {
        Objects.requireNonNull(taskId, "taskId");
        finalizations.lockTask(taskId);
        return finalizations.findByTaskIdForUpdate(taskId)
                .map(this::reassessAndSave);
    }

    private OpinionMapFinalization assess(
            OpinionMapFinalizationRequest request
    ) {
        int projectedSubmissionCount = Math.toIntExact(
                submissions.countByTaskId(request.taskId()));
        return OpinionMapFinalization.assess(
                request, projectedSubmissionCount, clock.instant());
    }

    private OpinionMapFinalization reassessAndSave(
            OpinionMapFinalization existing
    ) {
        OpinionMapFinalization reassessed = assess(existing.request());
        if (!reassessed.decision().equals(existing.decision())) {
            finalizations.updateDecision(reassessed);
            return reassessed;
        }
        return existing;
    }
}
