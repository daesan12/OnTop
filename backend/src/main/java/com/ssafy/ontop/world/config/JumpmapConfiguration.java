package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import com.ssafy.ontop.world.jumpmap.JumpmapService;
import com.ssafy.ontop.world.jumpmap.JumpmapStore;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableConfigurationProperties(JumpmapProperties.class)
public class JumpmapConfiguration {
    /**
     * 코스 mapVersion은 실제 선택된 충돌 장면과 비교하고, 판·지급 저장소(db 프로필)가 있어야 한다.
     * 기존 맵이나 DB 없는 실행에서는 플래그를 켜도 비활성이다. 충돌체·판정·status enabled가 이 결정을 함께 쓴다.
     */
    @Bean
    public JumpmapActivation jumpmapActivation(JumpmapProperties properties, WorldMapRuntime runtime,
            ObjectProvider<JumpmapStore> stores) {
        // 플래그가 꺼져 있으면 DB도 조회하지 않는다. 테이블이 없는 DB(운영 기본 migration 위치)는 저장소 없음으로 본다.
        var store = properties.enabled() ? stores.getIfAvailable() : null;
        return JumpmapActivation.decide(properties.enabled(), runtime.scene().version(), properties::loadCourse,
                store != null && store.ready());
    }

    @Bean(initMethod = "start", destroyMethod = "close")
    public JumpmapService jumpmapService(JumpmapActivation activation, ObjectProvider<JumpmapStore> stores,
            ObjectProvider<Clock> clocks) {
        return new JumpmapService(activation, stores.getIfAvailable(), clocks.getIfUnique(Clock::systemUTC));
    }
}
