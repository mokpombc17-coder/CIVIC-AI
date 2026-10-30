package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationManualRequest;

public interface OpinionMapGenerationManualRequestRepository {

    OpinionMapGenerationManualRequest insert(
            OpinionMapGenerationManualRequest request);
}
