package com.hamcheeze.vote.task.infra.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapPromptProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
final class ClasspathOpinionMapPromptProvider
        implements OpinionMapPromptProvider {

    private final String prompt;

    ClasspathOpinionMapPromptProvider() {
        try {
            prompt = new ClassPathResource("task-result-prompt.md")
                    .getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Opinion Map prompt resource could not be loaded",
                    exception);
        }
        if (prompt.isBlank()) {
            throw new IllegalStateException(
                    "Opinion Map prompt resource must not be blank");
        }
    }

    @Override
    public String loadPrompt() {
        return prompt;
    }
}
