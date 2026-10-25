package com.ssafy.ontop.behavior.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.domain.DropReason;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.behavior.service.BufferedBehaviorLog;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class BehaviorLogConfigurationTests {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(BehaviorLogConfiguration.class)
            .withBean(ObjectMapper.class);

    @Test
    void 설정이_없으면_아무것도_하지_않는_기록기를_등록하고_값을_만들지_않는다() {
        runner.run(context -> {
            BehaviorLog log = context.getBean(BehaviorLog.class);
            AtomicBoolean built = new AtomicBoolean();

            log.record(() -> {
                built.set(true);
                return null;
            });

            assertThat(log).isSameAs(BehaviorLog.disabled());
            assertThat(built).isFalse();
        });
    }

    @Test
    void 켰는데_DB가_없으면_시작을_실패시킨다() {
        runner.withPropertyValues("ontop.behavior-log.enabled=true")
                .run(context -> assertThat(context).hasFailed()
                        .getFailure().rootCause().hasMessageContaining("db 프로필"));
    }

    @Test
    void 켜고_DB가_있으면_큐_기록기를_등록하고_종료할_때_정리한다() {
        runner.withPropertyValues("ontop.behavior-log.enabled=true")
                .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
                .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
                .run(context -> {
                    BufferedBehaviorLog log = context.getBean(BufferedBehaviorLog.class);

                    context.close();
                    log.record(() -> null);

                    assertThat(log.dropped(DropReason.SHUTDOWN)).isEqualTo(1);
                });
    }

    @Test
    void 묶음_크기가_큐보다_크면_설정을_거절한다() {
        runner.withPropertyValues("ontop.behavior-log.queue-capacity=10", "ontop.behavior-log.batch-size=20")
                .run(context -> assertThat(context).hasFailed());
    }
}
