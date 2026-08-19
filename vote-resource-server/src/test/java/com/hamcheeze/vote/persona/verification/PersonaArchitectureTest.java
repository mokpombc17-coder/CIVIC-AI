package com.hamcheeze.vote.persona.verification;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

class PersonaArchitectureTest {

    private static final String DOMAIN_PACKAGE =
            "com.hamcheeze.vote.persona.domain";
    private static final List<String> FORBIDDEN_DEPENDENCIES = List.of(
            "org.springframework.",
            "jakarta.persistence.",
            "jakarta.servlet.",
            "org.hibernate.",
            "com.hamcheeze.vote.survey.");

    @Test
    void domainClassesHaveNoInfrastructureOrSurveyDependencies()
            throws Exception {
        assertNoDependencies(DOMAIN_PACKAGE, FORBIDDEN_DEPENDENCIES);
    }

    @Test
    void apiDoesNotDependOnSurvey() throws Exception {
        assertNoDependencies(
                "com.hamcheeze.vote.persona.api",
                List.of("com.hamcheeze.vote.survey."));
    }

    private void assertNoDependencies(
            String packageName,
            List<String> forbiddenDependencies
    ) throws Exception {
        for (Path root : classPathRoots(packageName)) {
            try (var paths = Files.walk(root)) {
                for (Path classFile : paths
                        .filter(path -> path.toString().endsWith(".class"))
                        .toList()) {
                    byte[] bytecode = Files.readAllBytes(classFile);
                    String constants = new String(
                            bytecode,
                            java.nio.charset.StandardCharsets.ISO_8859_1);
                    assertThat(forbiddenDependencies.stream()
                            .map(value -> value.replace('.', '/'))
                            .noneMatch(constants::contains))
                            .as("forbidden dependency in %s", classFile)
                            .isTrue();
                }
            }
        }
    }

    private List<Path> classPathRoots(String packageName) throws Exception {
        URI uri = getClass().getClassLoader().getResource(
                        packageName.replace('.', '/'))
                .toURI();
        if ("file".equals(uri.getScheme())) {
            return List.of(Path.of(uri));
        }
        if ("jar".equals(uri.getScheme())) {
            return withJarFileSystem(uri, () -> List.of(Path.of(uri)));
        }
        throw new IllegalStateException("unsupported classpath: " + uri);
    }

    private <T> T withJarFileSystem(
            URI uri,
            Supplier<T> action
    ) throws IOException {
        try (FileSystem ignored = FileSystems.newFileSystem(
                uri, new HashMap<>())) {
            return action.get();
        }
    }
}
