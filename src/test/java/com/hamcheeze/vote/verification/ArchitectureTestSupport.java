package com.hamcheeze.vote.verification;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

public final class ArchitectureTestSupport {

    private ArchitectureTestSupport() {
    }

    public static void assertNoDependencies(
            String packageName,
            List<String> forbiddenDependencies
    ) throws Exception {
        assertNoDependenciesMatching(
                packageName,
                forbiddenDependencies.stream()
                        .map(value -> Pattern.compile(Pattern.quote(
                                value.replace('.', '/'))))
                        .toList());
    }

    public static void assertNoDependenciesMatching(
            String packageName,
            List<Pattern> forbiddenDependencies
    ) throws Exception {
        for (Path root : productionClassPathRoots(packageName)) {
            try (var paths = Files.walk(root)) {
                for (Path classFile : paths
                        .filter(path -> path.toString().endsWith(".class"))
                        .toList()) {
                    byte[] bytecode = Files.readAllBytes(classFile);
                    String constants = new String(
                            bytecode,
                            java.nio.charset.StandardCharsets.ISO_8859_1);
                    assertThat(forbiddenDependencies.stream()
                            .noneMatch(pattern -> pattern.matcher(constants)
                                    .find()))
                            .as("forbidden dependency in %s", classFile)
                            .isTrue();
                }
            }
        }
    }

    private static List<Path> productionClassPathRoots(
            String packageName
    ) throws Exception {
        String resourceName = packageName.replace('.', '/');
        var resources = ArchitectureTestSupport.class.getClassLoader()
                .getResources(resourceName);
        List<Path> roots = new ArrayList<>();

        while (resources.hasMoreElements()) {
            URI uri = resources.nextElement().toURI();
            if ("file".equals(uri.getScheme())) {
                Path root = Path.of(uri);
                if (!isTestOutput(root)) {
                    roots.add(root);
                }
            }
        }

        assertThat(roots)
                .as("production classpath roots for %s", packageName)
                .isNotEmpty();
        return roots;
    }

    private static boolean isTestOutput(Path root) {
        String normalized = root.toString().replace('\\', '/');
        return normalized.contains("/classes/java/test/")
                || normalized.contains("/test-classes/")
                || normalized.contains("/out/test/");
    }
}
