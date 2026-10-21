package com.ssafy.ontop.game.engine;

import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.state.GameStateGateway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {"spring.profiles.active=local", "ontop.games.omok.enabled=false"})
@DirtiesContext
class GameEngineProfileTests {
    @Autowired
    private ApplicationContext context;

    @Test
    void 기본local에는_테스트엔진이나_공통Gateway가_유입되지않는다() {
        assertThat(context.getBeansOfType(GameEngineRouter.class)).isEmpty();
        assertThat(context.getBeansOfType(GameActionGateway.class)).isEmpty();
        assertThat(context.getBeansOfType(GameStateGateway.class)).isEmpty();
        assertThat(context.getBeansOfType(GameRecoveryGateway.class)).isEmpty();
    }
}
