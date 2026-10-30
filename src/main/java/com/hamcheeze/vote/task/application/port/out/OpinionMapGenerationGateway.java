package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRequest;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationGatewayResult;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationProvider;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;

public interface OpinionMapGenerationGateway {

    OpinionMapOptionExplanationV1 generate(
            OpinionMapGenerationRequest request);

    default OpinionMapGenerationProvider provider() {
        return OpinionMapGenerationProvider.unknown();
    }

    default OpinionMapGenerationGatewayResult generateWithMetadata(
            OpinionMapGenerationRequest request
    ) {
        return OpinionMapGenerationGatewayResult.unmetered(
                generate(request), provider());
    }
}
