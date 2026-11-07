package com.ssafy.ontop.game.skewer.coop.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.TransactionException;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.skewer-coop.enabled", havingValue = "true")
@Import(GameEngineGateways.class)
public class SkewerCoopConfiguration {
    private static final Logger log = LoggerFactory.getLogger(SkewerCoopConfiguration.class);
    @Bean
    SkewerCoopEngine skewerCoopEngine(ObjectMapper mapper, GameEngineRouter router,
            ApplicationEventPublisher events, GameReconnectService recovery, WorldChannelRegistry channels,
            SkewerCoopSettlementService settlements, ServiceOperationService operations) {
        return new SkewerCoopEngine(mapper, Clock.systemUTC(), router, events::publishEvent,
                recovery::startResolved, (user, channel) -> channel.equals(channels.channelOf(Long.toString(user))),
                new SecureRandom(), 240, settlements::finished, () -> {
                    try {
                        return operations.allowsNewActivity();
                    } catch (DataAccessException | TransactionException exception) {
                        return false;
                    }
                });
    }

    @Bean(destroyMethod = "close")
    AutoCloseable skewerCoopTimer(SkewerCoopEngine engine) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("skewer-coop-timer").factory());
        ScheduledExecutorService writer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("skewer-coop-journal").factory());
        timer.scheduleWithFixedDelay(() -> {
            try {
                engine.tick();
            } catch (RuntimeException exception) {
                // 예약 작업 밖으로 예외가 나가면 이후 모든 틱이 취소되므로 경계에서 격리한다.
                log.error("꼬치왕 틱 오류가 발생했습니다. 다음 주기에 다시 실행합니다.", exception);
            }
        }, 100, 100, TimeUnit.MILLISECONDS);
        Runnable persist = () -> {
            try {
                engine.persistTerminalResults();
            } catch (RuntimeException exception) {
                log.error("꼬치왕 영속 인계 작업자가 다음 주기에 재시도합니다.", exception);
            }
        };
        writer.scheduleWithFixedDelay(persist, 100, 100, TimeUnit.MILLISECONDS);
        return () -> {
            timer.shutdownNow();
            try {
                timer.awaitTermination(5, TimeUnit.SECONDS);
                writer.execute(persist);
                writer.shutdown();
                if (!writer.awaitTermination(10, TimeUnit.SECONDS)) {
                    log.error("꼬치왕 종료 결과 저장 대기가 종료 시간을 초과했습니다. 미저장 결과가 남을 수 있습니다.");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                log.warn("꼬치왕 종료 결과 저장 대기가 중단되었습니다.", exception);
            } finally {
                writer.shutdownNow();
            }
        };
    }

    @Bean(destroyMethod = "close")
    AutoCloseable skewerCoopSettlementTimer(SkewerCoopSettlementService settlements) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("skewer-coop-settlement").factory());
        timer.scheduleWithFixedDelay(settlements::retry, 250, 250, TimeUnit.MILLISECONDS);
        return () -> timer.shutdownNow();
    }
}
