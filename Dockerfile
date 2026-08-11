# syntax=docker/dockerfile:1.7
FROM gradle:8.14.2-jdk21-alpine AS build
WORKDIR /workspace
COPY . .
RUN gradle --no-daemon clean bootJar

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S civic && adduser -S -G civic -u 10001 civic
WORKDIR /app
COPY --from=build /workspace/build/libs/civic-main-auth-*.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
