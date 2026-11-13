package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ResidentServiceConfigurationTests {
    WebApplicationContextRunner runtime(String profile){return new WebApplicationContextRunner().withUserConfiguration(ResidentServiceConfiguration.class)
            .withPropertyValues("spring.profiles.active="+profile,"ontop.ai.enabled=true","AI_RAPFI_PATH=")
            .withBean(ObjectMapper.class,ObjectMapper::new)
            .withInitializer(c->{c.getBeanFactory().registerSingleton("hub",mock(TableHub.class));
                c.getBeanFactory().registerSingleton("ai",mock(LocalWorldAi.class));
                c.getBeanFactory().registerSingleton("map",mock(WorldMapRuntime.class));})
            .withBean(AiText.class,AiText::fixed);}
    @ParameterizedTest @ValueSource(strings={"dev,db","prod,db","production,db"})
    void initializedServiceIsAvailableInEveryRealEnvironment(String profile){runtime(profile).run(c->{
        assertThat(c).hasSingleBean(LocalCompanions.class);assertThat(c.getBean(LocalCompanions.class).featureKey()).isEqualTo("companions");
    });}
    @ParameterizedTest @ValueSource(strings={"dev,db","prod,db"})
    void environmentSwitchCanDisableResidents(String profile){runtime(profile).withPropertyValues("ontop.ai.residents-enabled=false")
            .run(c->assertThat(c).doesNotHaveBean(LocalCompanions.class));}
    @ParameterizedTest @ValueSource(strings={"local,db","local,ai-park","dev,db,ai-park"})
    void fixtureBootstrapIsNotRegisteredTwice(String profile){runtime(profile).run(c->assertThat(c).doesNotHaveBean(LocalCompanions.class));}
}
