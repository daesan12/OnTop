FROM eclipse-temurin:21-jdk-jammy AS build

WORKDIR /workspace
COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle
RUN sed -i 's/\r$//' ./gradlew && chmod +x ./gradlew
COPY src ./src
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 ontop \
    && useradd --system --uid 10001 --gid ontop --home-dir /app ontop

WORKDIR /app
COPY --from=build --chown=ontop:ontop /workspace/build/libs/*.jar ./app.jar
COPY --chown=ontop:ontop docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 0500 ./docker-entrypoint.sh

USER ontop
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
