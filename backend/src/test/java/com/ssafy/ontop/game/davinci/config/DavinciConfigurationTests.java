package com.ssafy.ontop.game.davinci.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.davinci.service.DavinciEngine;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DavinciConfigurationTests {
    @ParameterizedTest
    @ValueSource(strings = {"tick", "snapshot", "world"})
    void 틱과_공개조회와_월드전파가_각각_실패해도_다음_스케줄은_계속된다(String stage) throws Exception {
        DavinciEngine engine = mock(DavinciEngine.class);
        WorldChannelRegistry world = mock(WorldChannelRegistry.class);
        Map<String, JsonNode> views = Map.of();
        when(engine.tablePresentations()).thenReturn(views);
        var failure = new IllegalStateException("일시적인 " + stage + " 실패");
        if (stage.equals("tick")) {
            doThrow(failure).doNothing().when(engine).tick();
        } else if (stage.equals("snapshot")) {
            when(engine.tablePresentations()).thenThrow(failure).thenReturn(views);
        }
        CountDownLatch propagated = new CountDownLatch(2);
        AtomicInteger attempts = new AtomicInteger();
        doAnswer(call -> {
            if (stage.equals("world") && attempts.getAndIncrement() == 0) { throw failure; }
            propagated.countDown();
            return null;
        }).when(world).secretTilePresentations(anyMap());

        var timer = new DavinciConfiguration().davinciTimer(engine, Optional.of(world));
        try {
            assertThat(propagated.await(5, TimeUnit.SECONDS)).isTrue();
            verify(engine, atLeast(3)).tick();
            assertThat(timer.isShutdown()).isFalse();
        } finally {
            timer.shutdownNow();
            assertThat(timer.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }
}
