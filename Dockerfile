FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /workspace

COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle
COPY civic-auth-resource-server-adapter/build.gradle \
    ./civic-auth-resource-server-adapter/build.gradle

RUN ./gradlew --no-daemon dependencies

COPY civic-auth-resource-server-adapter/src \
    ./civic-auth-resource-server-adapter/src
COPY src ./src

RUN ./gradlew --no-daemon clean bootJar

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home appuser

WORKDIR /app

COPY --from=builder --chown=appuser:appuser \
    /workspace/build/libs/*.jar /app/app.jar

USER appuser

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
    CMD curl --fail --silent --show-error \
        http://localhost:8082/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
