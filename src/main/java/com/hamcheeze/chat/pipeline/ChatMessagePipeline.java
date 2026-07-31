package com.hamcheeze.chat.pipeline;

public interface ChatMessagePipeline {

    PipelineAvailability availability();

    PipelineAcceptance tryAccept(AdmittedMessageCommand command);
}
