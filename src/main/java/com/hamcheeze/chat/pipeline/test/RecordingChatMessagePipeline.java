package com.hamcheeze.chat.pipeline.test;

import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;

@Component
@Profile("limit-test")
@ConditionalOnProperty(
        prefix = "chat.message-pipeline",
        name = "mode",
        havingValue = "recording",
        matchIfMissing = true)
public final class RecordingChatMessagePipeline
        implements ChatMessagePipeline {

    private final ArrayBlockingQueue<AdmittedChatCommand> commands =
            new ArrayBlockingQueue<>(10_000);

    @Override
    public PipelineAvailability availability() {
        return PipelineAvailability.AVAILABLE;
    }

    @Override
    public PipelineAcceptance tryAccept(AdmittedChatCommand command) {
        return commands.offer(command)
                ? PipelineAcceptance.ACCEPTED_FOR_PROCESSING
                : PipelineAcceptance.BUSY;
    }

    public List<AdmittedChatCommand> recordedCommands() {
        return List.copyOf(commands);
    }

    public void clear() {
        commands.clear();
    }
}
