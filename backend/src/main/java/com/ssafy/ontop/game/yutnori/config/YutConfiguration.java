package com.ssafy.ontop.game.yutnori.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.yutnori.service.YutEngine;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Import(GameEngineGateways.class)
public class YutConfiguration {
    private static final Logger log = LoggerFactory.getLogger(YutConfiguration.class);

    @Bean
    YutEngine yutEngine(ObjectMapper mapper, GameEngineRouter router, ApplicationEventPublisher events,
            GameReconnectService recovery, WorldChannelRegistry channels) {
        return new YutEngine(mapper, Clock.systemUTC(), new SecureRandom(), router, events::publishEvent,
                recovery::startResolved, (user, channel) -> channel.equals(channels.channelOf(Long.toString(user))));
    }

    @Bean(destroyMethod = "close")
    AutoCloseable yutTimer(YutEngine engine, ObjectProvider<JdbcTemplate> database) {
        var timer = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon(true).name("yut-timer").factory());
        Set<String> stored = new HashSet<>();
        timer.scheduleWithFixedDelay(() -> {
            try {
                var terminal = engine.tick();
                engine.dispatch();
                Set<String> retained = new HashSet<>();
                for (var snapshot : terminal) {
                    String id = snapshot.path("gameId").asText();
                    retained.add(id);
                    JdbcTemplate jdbc = database.getIfAvailable();
                    if (jdbc != null && !stored.contains(id)) {
                        var state = snapshot.path("publicState");
                        jdbc.update("INSERT INTO yutnori_results (game_id, channel_id, winner_team, end_reason, result_json) "
                                + "VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE game_id = game_id",
                                id, state.path("channelId").asText(), state.path("winner").asInt(),
                                state.path("reason").asText(), state.toString());
                        stored.add(id);
                    }
                }
                stored.retainAll(retained);
            } catch (RuntimeException exception) {
                log.error("윷놀이 상태 확인·종료 기록 저장을 다음 주기에 재시도합니다.", exception);
            }
        }, 1, 1, TimeUnit.SECONDS);
        return () -> timer.shutdownNow();
    }
}
