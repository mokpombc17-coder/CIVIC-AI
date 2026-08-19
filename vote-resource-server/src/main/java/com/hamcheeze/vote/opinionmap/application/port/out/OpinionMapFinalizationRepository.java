package com.hamcheeze.vote.opinionmap.application.port.out;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalization;

import java.util.Optional;
import java.util.UUID;

public interface OpinionMapFinalizationRepository {

    void lockTask(UUID taskId);

    boolean insertIfAbsent(OpinionMapFinalization finalization);

    Optional<OpinionMapFinalization> findByTaskId(UUID taskId);

    Optional<OpinionMapFinalization> findByTaskIdForUpdate(UUID taskId);

    void updateDecision(OpinionMapFinalization finalization);
}
