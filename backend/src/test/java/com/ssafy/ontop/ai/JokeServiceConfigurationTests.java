package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.config.WorldMapProperties;
import javax.sql.DataSource;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class JokeServiceConfigurationTests {
    WebApplicationContextRunner runtime(String profile){return new WebApplicationContextRunner().withUserConfiguration(JokeServiceConfiguration.class)
            .withPropertyValues("spring.profiles.active="+profile,"ontop.ai.enabled=true","ontop.ai.joke-enabled=true","OPENAI_API_KEY=")
            .withBean(ObjectMapper.class,ObjectMapper::new).withBean(DataSource.class,()->mock(DataSource.class))
            .withBean(WorldMapProperties.class,()->new WorldMapProperties(null,null,null,false)).withBean(AiText.class,AiText::fixed);}
    @ParameterizedTest @ValueSource(strings={"dev,db","prod,db","production,db"})
    void serviceUsesJdbcAndNeverFixtureScores(String profile){runtime(profile).run(c->{
        assertThat(c).hasSingleBean(LocalJokeContest.class);
        var mine=c.getBean(LocalJokeContest.class);assertThat(mine.featureKey()).isEqualTo("jokeContest");
        assertThat(c.getBean(JokeJudgeLocation.class).x()).isFinite();
    });}
    @ParameterizedTest @ValueSource(strings={"ontop.ai.enabled=false","ontop.ai.joke-enabled=false"})
    void bothEnvironmentSwitchesAreRequired(String property){runtime("dev,db").withPropertyValues(property).run(c->assertThat(c).doesNotHaveBean(LocalJokeContest.class));}
    @ParameterizedTest @ValueSource(strings={"local,db","local,ai-park","dev,db,ai-park"})
    void localFixtureIsNotRegisteredTwice(String profile){runtime(profile).run(c->assertThat(c).doesNotHaveBean(LocalJokeContest.class));}
}
