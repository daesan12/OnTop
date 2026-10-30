package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableConfigurationProperties(JumpmapProperties.class)
public class JumpmapConfiguration {
    /** 코스 mapVersion은 실제 선택된 충돌 장면과 비교한다. 기존 맵에서는 플래그를 켜도 비활성이다. */
    @Bean
    public JumpmapActivation jumpmapActivation(JumpmapProperties properties, WorldMapRuntime runtime) {
        return JumpmapActivation.decide(properties.enabled(), runtime.scene().version(), JumpCourse::loadDefault);
    }
}
