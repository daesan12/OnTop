package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import com.ssafy.ontop.event.minigame.MinigameAwardRepository.Candidate;
import com.ssafy.ontop.event.minigame.WeeklyMinigameRepository.ConfiguredGame;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WeeklyMinigameAwardExclusionTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 9);
    private static final Instant START = Instant.parse("2026-11-09T00:00:00Z");
    private static final Instant END = Instant.parse("2026-11-18T15:00:00Z");

    @Test
    void GM은_모든_미니게임에서_매크로는_지정된_게임에서만_제외한다() {
        var configurations = mock(WeeklyMinigameRepository.class);
        var records = mock(MinigameAwardRepository.class);
        var admins = new AdminAccessPolicy(new AdminAccessProperties(Set.of(99L), Set.of(), Set.of(99L)));
        var service = new WeeklyMinigameAwardService(configurations, records, admins, transactions(),
                Clock.fixed(Instant.parse("2026-11-19T01:00:00Z"), ZoneOffset.UTC),
                Set.of(98L), Map.of("MG_MOLE", Set.of(10L), "MG_SPEED_MOLE", Set.of(12L)));

        var mole = game("MG_MOLE", "mole-v3");
        var speedMole = game("MG_SPEED_MOLE", "speed-mole-v1");
        when(configurations.game("MG_MOLE", WEEK, false)).thenReturn(Optional.of(mole));
        when(configurations.game("MG_SPEED_MOLE", WEEK, false)).thenReturn(Optional.of(speedMole));
        when(records.weeklyCandidates("MG_MOLE", START, END)).thenReturn(List.of(
                candidate("gm-admin", 99, 9_999), candidate("gm-configured", 98, 9_000),
                candidate("mole-macro", 10, 8_000), candidate("speed-only-macro", 12, 7_000),
                candidate("eligible", 11, 6_000)));
        when(records.weeklyCandidates("MG_SPEED_MOLE", START, END)).thenReturn(List.of(
                candidate("gm-admin-speed", 99, 999), candidate("gm-configured-speed", 98, 900),
                candidate("speed-macro", 12, 800), candidate("mole-only-macro", 10, 700),
                candidate("eligible-speed", 11, 600)));

        var moleRanking = service.ranking(WEEK, "MG_MOLE", 99);
        assertThat(moleRanking.excludedGmCount()).isEqualTo(3);
        assertThat(moleRanking.ranks()).extracting(WeeklyMinigameAwardService.Rank::userId)
                .containsExactly(12L, 11L);

        var speedRanking = service.ranking(WEEK, "MG_SPEED_MOLE", 99);
        assertThat(speedRanking.excludedGmCount()).isEqualTo(3);
        assertThat(speedRanking.ranks()).extracting(WeeklyMinigameAwardService.Rank::userId)
                .containsExactly(10L, 11L);
    }

    private ConfiguredGame game(String code, String rule) {
        return new ConfiguredGame(1, WEEK, START, END, Instant.parse("2026-11-19T00:00:00Z"),
                null, code, code, rule, true, 1, "미니게임 1등상");
    }

    private Candidate candidate(String recordId, long userId, long score) {
        return new Candidate(recordId, userId, "user-" + userId, score,
                Instant.parse("2026-11-17T00:00:00Z"), 0);
    }

    private PlatformTransactionManager transactions() {
        return new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
    }
}
