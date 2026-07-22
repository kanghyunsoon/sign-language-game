FROM eclipse-temurin:17-jdk-jammy AS builder

WORKDIR /workspace

COPY gradlew ./
COPY gradle ./gradle
COPY build.gradle settings.gradle ./

RUN chmod +x gradlew

COPY src ./src

RUN ./gradlew clean bootJar --no-daemon \
    && cp "$(find build/libs -maxdepth 1 -type f -name '*.jar' ! -name '*-plain.jar' -print -quit)" /tmp/app.jar

FROM eclipse-temurin:17-jre-jammy

RUN groupadd --system spring \
    && useradd --system --gid spring spring

WORKDIR /app

COPY --from=builder --chown=spring:spring /tmp/app.jar ./app.jar

USER spring:spring

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]