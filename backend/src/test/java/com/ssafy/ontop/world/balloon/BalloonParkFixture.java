package com.ssafy.ontop.world.balloon;

import com.ssafy.ontop.demo.StoneRumbleParkApplication.LocalLedger;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;

/** 승강장 위치와 기존 탑승 계약은 실제 처리하며 100냥 결제만 로컬 메모리에서 수행한다. */
@TestConfiguration(proxyBeanMethods = false)
@Profile("local & stone-rumble-park & !db & !dev & !prod & !production")
@ConditionalOnProperty(name = "ontop.qa-feedback.enabled", havingValue = "true")
public class BalloonParkFixture {
    @Bean
    BalloonFareController qaBalloonController(WorldMapRuntime map, WorldChannelRegistry channels,
            BalloonFlights flights, LocalLedger ledger) {
        var station = map.prepared().map(BalloonStation::findIn).orElseThrow();
        var service = new BalloonFareService(null, null, channels, map) {
            private final Map<String, Receipt> receipts = new HashMap<>();

            @Override
            public synchronized Receipt buy(long userId, UUID requestId) {
                if (!station.canBoard(channels.positionOf(Long.toString(userId)))) {
                    throw new Rejected("BALLOON_STATION_REQUIRED", "승강장 문 앞으로 이동해 주세요.");
                }
                return receipts.computeIfAbsent(userId + ":" + requestId, key -> {
                    if (!ledger.debitForQa(userId, 100)) {
                        throw new Rejected("INSUFFICIENT_COINS", "열기구에 타려면 100냥이 필요해요.");
                    }
                    return new Receipt(requestId, 100, Instant.now());
                });
            }
        };
        return new BalloonFareController(service, flights, channels);
    }
}
