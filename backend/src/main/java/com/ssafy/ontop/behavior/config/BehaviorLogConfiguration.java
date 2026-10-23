package com.ssafy.ontop.behavior.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.repository.JdbcBehaviorStore;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.behavior.service.BufferedBehaviorLog;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@EnableConfigurationProperties(BehaviorLogProperties.class)
public class BehaviorLogConfiguration {

    /**
     * 꺼져 있으면 아무것도 하지 않는 기록기를 등록해 호출하는 쪽이 조건 없이 주입받게 한다.
     * 켜져 있는데 DB가 없으면 조용히 빠지지 않도록 시작을 실패시킨다.
     * 종료 시 close()가 남은 큐를 저장한다. 이 Bean을 쓰는 TableHub 등이 먼저 정리된 뒤 호출된다.
     */
    @Bean(destroyMethod = "close")
    BehaviorLog behaviorLog(BehaviorLogProperties properties, ObjectProvider<JdbcTemplate> jdbc,
            ObjectProvider<PlatformTransactionManager> transactions, ObjectMapper mapper) {
        if (!properties.enabled()) {
            return BehaviorLog.disabled();
        }
        JdbcTemplate template = jdbc.getIfAvailable();
        PlatformTransactionManager manager = transactions.getIfAvailable();
        if (template == null || manager == null) {
            throw new IllegalStateException("ontop.behavior-log.enabled=true에는 db 프로필이 필요합니다.");
        }
        return new BufferedBehaviorLog(new JdbcBehaviorStore(template, manager, mapper), properties).start();
    }
}
