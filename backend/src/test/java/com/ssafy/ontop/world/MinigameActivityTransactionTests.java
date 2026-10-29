package com.ssafy.ontop.world;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.minigame.service.MinigameActivityChanged;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class MinigameActivityTransactionTests {
    @Test
    void 커밋_후에만_이용_상태를_공개하고_롤백한_종료는_기존_표시를_지우지_않는다() {
        var channels = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("channel-1", "공원", 3))));
        var hub = new TableHub(new ObjectMapper(), Optional.empty(), false, Optional.empty(),
                Duration.ofSeconds(10), Duration.ofSeconds(10), channels);
        var manager = new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new Object(); }
            @Override protected void doBegin(Object tx, TransactionDefinition definition) { }
            @Override protected void doCommit(DefaultTransactionStatus status) { }
            @Override protected void doRollback(DefaultTransactionStatus status) { }
        };
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(TransactionalEventListenerFactory.class);
            // TableHub is normally servlet-only; register this instance directly for the event test.
            context.getBeanFactory().registerSingleton("hub", hub);
            context.refresh();
            channels.join("101", "channel-1");
            var tx = new TransactionTemplate(manager);

            tx.executeWithoutResult(status -> {
                context.publishEvent(new MinigameActivityChanged(101, 10, Instant.now().plusSeconds(60)));
                assertThat(TransactionSynchronizationManager.getSynchronizations()).hasSize(1);
                assertThat(activity(channels)).isNull();
            });
            assertThat(activity(channels)).isEqualTo("BUNGEOPPANG");

            tx.executeWithoutResult(status -> {
                context.publishEvent(new MinigameActivityChanged(101, 11, Instant.now().plusSeconds(60)));
                status.setRollbackOnly();
            });
            tx.executeWithoutResult(status -> {
                context.publishEvent(new MinigameActivityChanged(101, 10, null));
                status.setRollbackOnly();
            });
            assertThat(activity(channels)).isEqualTo("BUNGEOPPANG");

            tx.executeWithoutResult(status -> context.publishEvent(new MinigameActivityChanged(101, 10, null)));
            assertThat(activity(channels)).isNull();
        } finally {
            hub.shutdown();
            channels.clear();
        }
    }

    private static String activity(WorldChannelRegistry channels) {
        return channels.worldState("channel-1").avatars().getFirst().activity();
    }
}
