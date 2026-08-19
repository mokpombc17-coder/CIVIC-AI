package com.hamcheeze.vote.opinionmap.application.port.out;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;

import java.util.Optional;
import java.util.UUID;

public interface OpinionMapSubmissionProjectionRepository {

    boolean insertIfAbsent(OpinionMapSubmissionProjection submission);

    Optional<OpinionMapSubmissionProjection> findBySubmissionId(UUID submissionId);

    long countByTaskId(UUID taskId);
}
