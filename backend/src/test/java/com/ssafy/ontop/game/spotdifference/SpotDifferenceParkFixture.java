package com.ssafy.ontop.game.spotdifference;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.demo.StoneRumbleParkApplication.LocalLedger;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;

/** 실제 게임 규칙·HTTP를 사용하는 로컬 QA. 회원·정산은 메모리 대역이며 운영 JAR에는 포함되지 않는다. */
@TestConfiguration(proxyBeanMethods = false)
@Profile("local & stone-rumble-park & !db & !dev & !prod & !production")
@ConditionalOnProperty(name = "ontop.qa-feedback.enabled", havingValue = "true")
public class SpotDifferenceParkFixture {
    @Bean
    SpotDifferenceController qaSpotDifferenceController(ObjectMapper mapper, LocalLedger ledger) throws IOException {
        var rewards = new SpotDifferenceRewards(null, null, null) {
            private final Map<Long, Long> earned = new HashMap<>();
            private final Map<String, Receipt> receipts = new HashMap<>();

            @Override
            public synchronized Budget status(long userId) {
                return new Budget(earned.getOrDefault(userId, 0L), 1000);
            }

            @Override
            public synchronized Receipt settle(long userId, UUID id, int calculated) {
                return receipts.computeIfAbsent(userId + ":" + id, key -> {
                    long total = earned.getOrDefault(userId, 0L);
                    int granted = (int) Math.min(calculated, Math.max(0, 1000 - total));
                    earned.put(userId, total + granted);
                    ledger.creditForQa(userId, granted);
                    return new Receipt(calculated, granted, total + granted);
                });
            }
        };
        var games = new SpotDifferenceService(mapper, rewards);
        return new SpotDifferenceController(games, new SpotDifferenceDuelService(games));
    }
}
