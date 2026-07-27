package com.hamcheeze.chat;

import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import com.hamcheeze.chat.support.RecordingChatMessagePipeline;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.convention.TestBean;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("local")
class RecordingChatMessagePipelineOverrideTest {

    @TestBean(
            name = "chatMessagePipeline",
            methodName = "recordingPipeline",
            enforceOverride = true)
    private ChatMessagePipeline pipeline;

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void replacesRuntimePipelineWithoutStartingWorker() {
        assertThat(pipeline)
                .isInstanceOf(RecordingChatMessagePipeline.class);
        assertThat(applicationContext.getBeansOfType(
                InMemoryChatMessagePipeline.class)).isEmpty();
    }

    static ChatMessagePipeline recordingPipeline() {
        return new RecordingChatMessagePipeline();
    }
}
