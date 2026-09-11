package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRequest;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;

public interface OpinionMapGenerationGateway {

    OpinionMapOptionExplanationV1 generate(
            OpinionMapGenerationRequest request);
}
