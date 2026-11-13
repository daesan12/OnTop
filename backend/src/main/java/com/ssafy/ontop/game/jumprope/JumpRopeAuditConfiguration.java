package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.function.LongPredicate;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

/** 줄넘기 판 기록 저장소. 게임 구성(JumpRopeConfiguration)을 건드리지 않고 같은 조건에서만 켠다. */
@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
public class JumpRopeAuditConfiguration {
    @Bean(destroyMethod = "close")
    JumpRopeAudit jumpRopeAudit(JdbcTemplate jdbc, ObjectProvider<WorldChannelRegistry> channels) {
        WorldChannelRegistry registry = channels.getIfAvailable();
        LongPredicate inPark = registry == null ? null : userId -> registry.channelOf(Long.toString(userId)) != null;
        return new JumpRopeAudit(jdbc, inPark);
    }
}
