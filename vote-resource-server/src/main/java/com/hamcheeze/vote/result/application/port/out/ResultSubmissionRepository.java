package com.hamcheeze.vote.result.application.port.out;

import com.hamcheeze.vote.result.domain.ResultSubmission;

import java.util.Optional;
import java.util.UUID;

public interface ResultSubmissionRepository {

    boolean insertIfAbsent(ResultSubmission submission);

    Optional<ResultSubmission> findBySubmissionId(UUID submissionId);
}
