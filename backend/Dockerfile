FROM eclipse-temurin:21-jdk-jammy AS build

WORKDIR /workspace
COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle
RUN sed -i 's/\r$//' ./gradlew && chmod +x ./gradlew
COPY src ./src
# 소스 변경 뒤에도 Gradle 배포본과 의존성을 다시 내려받지 않도록 빌더 캐시를 유지한다.
RUN --mount=type=cache,id=ontop-backend-gradle,target=/root/.gradle,sharing=locked \
    set -eu; \
    for attempt in 1 2 3; do \
        if ./gradlew --no-daemon --version; then break; fi; \
        if [ "$attempt" -eq 3 ]; then exit 1; fi; \
        echo "Gradle distribution download failed; retrying ($attempt/3)..."; \
        sleep 5; \
    done; \
    ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 ontop \
    && useradd --system --uid 10001 --gid ontop --home-dir /app ontop

WORKDIR /app
COPY --from=build --chown=ontop:ontop /workspace/build/libs/*.jar ./app.jar
COPY --chown=ontop:ontop docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod 0500 ./docker-entrypoint.sh

USER ontop
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
