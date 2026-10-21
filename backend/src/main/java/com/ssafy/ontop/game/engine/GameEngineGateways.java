package com.ssafy.ontop.game.engine;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

// 엔진 설정에서만 @Import한다. 엔진을 켜지 않은 기본 local의 Gateway 미등록 동작을 보존한다.
public class GameEngineGateways {
    @Bean
    @Primary
    GameEngineRouter gameEngineRouter() {
        return new GameEngineRouter();
    }
}
