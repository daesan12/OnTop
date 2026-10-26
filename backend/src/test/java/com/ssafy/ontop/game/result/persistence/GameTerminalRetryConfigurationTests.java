package com.ssafy.ontop.game.result.persistence;

import java.util.concurrent.ScheduledExecutorService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class GameTerminalRetryConfigurationTests {
    private final GameTerminalRetryService retries = mock(GameTerminalRetryService.class);
    private final GameResultNotifications notifications = mock(GameResultNotifications.class);
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(GameTerminalRetryConfiguration.class)
            .withBean(GameTerminalRetryService.class, () -> retries)
            .withBean(GameResultNotifications.class, () -> notifications)
            .withBean(GameTableRecovery.class, () -> mock(GameTableRecovery.class))
            .withPropertyValues("spring.profiles.active=db", "ontop.game-start.enabled=true");

    @Test
    void 명시적_시작옵션이_있으면_종결재시도와_outbox를_함께_등록한다() {
        runner.run(context -> assertThat(context.getBeansOfType(ScheduledExecutorService.class)).hasSize(2));
        verifyNoInteractions(retries);
    }

    @Test
    void 격리테스트의_수동펌프설정은_백그라운드만_제외한다() {
        runner.withPropertyValues("ontop.game-recovery.background-enabled=false")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(ScheduledExecutorService.class));
        verifyNoInteractions(retries);
    }

    @Test void 시작기능이_꺼져있으면_자동복구도_등록하지않는다() {
        runner.withPropertyValues("ontop.game-start.enabled=false")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(ScheduledExecutorService.class));
    }
}
