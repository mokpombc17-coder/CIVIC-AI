package com.hamcheeze.chat.pipeline.skeleton;

import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("skeleton")
public final class UnavailableChatMessagePipeline
        implements ChatMessagePipeline {

    @Override
    public PipelineAvailability availability() {
        return PipelineAvailability.UNAVAILABLE;
    }

    @Override
    public PipelineAcceptance tryAccept(AdmittedChatCommand command) {
        return PipelineAcceptance.UNAVAILABLE;
    }
}
