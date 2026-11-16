package com.ssafy.ontop.minigame.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

/** 두더지 타이밍 기록 저장소. 게임 구성(MoleConfiguration·SpeedMoleConfiguration)을 건드리지 않고 같은 조건에서만 켠다. */
@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
public class MoleTimingAuditConfiguration {
    @Bean(destroyMethod = "close")
    MoleTimingAudit moleTimingAudit(JdbcTemplate jdbc, ObjectMapper mapper) {
        return new MoleTimingAudit(jdbc, mapper);
    }
}
