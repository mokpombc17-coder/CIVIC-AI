package com.hamcheeze.chat.support;

import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.AdmittedMessageCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;

public final class RecordingChatMessagePipeline
        implements ChatMessagePipeline {

    private final ArrayBlockingQueue<AdmittedMessageCommand> commands =
            new ArrayBlockingQueue<>(10_000);

    @Override
    public PipelineAvailability availability() {
        return PipelineAvailability.AVAILABLE;
    }

    @Override
    public PipelineAcceptance tryAccept(AdmittedMessageCommand command) {
        return commands.offer(command)
                ? PipelineAcceptance.ACCEPTED_FOR_PROCESSING
                : PipelineAcceptance.BUSY;
    }

    public List<AdmittedChatCommand> recordedCommands() {
        return commands.stream()
                .filter(AdmittedChatCommand.class::isInstance)
                .map(AdmittedChatCommand.class::cast)
                .toList();
    }

    public void clear() {
        commands.clear();
    }
}
