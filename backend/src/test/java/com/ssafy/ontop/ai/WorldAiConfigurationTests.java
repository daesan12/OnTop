package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class WorldAiConfigurationTests {
 @TempDir Path directory;
 private WebApplicationContextRunner runtime(){return new WebApplicationContextRunner()
  .withUserConfiguration(WorldAiConfiguration.class)
  .withPropertyValues("spring.profiles.active=dev,db","AI_DATA_DIRECTORY="+directory,
   "AI_JEV_ENABLED=false","AI_MM_ENABLED=false","AI_POLICE_ENABLED=false","OPENAI_API_KEY=")
  .withBean(ObjectMapper.class,ObjectMapper::new)
  .withInitializer(c->{c.getBeanFactory().registerSingleton("hub",mock(TableHub.class));
   c.getBeanFactory().registerSingleton("map",mock(WorldMapRuntime.class));
   c.getBeanFactory().registerSingleton("jumpmap",mock(JumpmapActivation.class));});}
 @Test void defaultsDoNotActivateProductionProviders(){runtime().run(c->assertThat(c).doesNotHaveBean(LocalWorldAi.class).doesNotHaveBean(AiText.class));}
 @Test void explicitRuntimeUsesSafeFixedTextWithoutKeys(){runtime().withPropertyValues("ontop.ai.enabled=true").run(c->{
  assertThat(c).hasSingleBean(LocalWorldAi.class).hasSingleBean(AiText.class);
  assertThat(c.getBean(AiText.class).mode()).isEqualTo(AiText.fixed().mode());
 });}
 @ParameterizedTest @ValueSource(strings={"dev,db","prod,db","production,db"})
 void runtimeActivationUsesSameFlagAcrossServiceEnvironments(String profiles){
  runtime().withPropertyValues("spring.profiles.active="+profiles,"ontop.ai.enabled=true")
   .run(c->assertThat(c).hasSingleBean(LocalWorldAi.class).hasSingleBean(AiText.class));
 }
 @ParameterizedTest @ValueSource(strings={"dev,db","prod,db","production,db"})
 void disabledFlagDoesNotCreateWorkersInAnyServiceEnvironment(String profiles){
  runtime().withPropertyValues("spring.profiles.active="+profiles,"ontop.ai.enabled=false")
   .run(c->assertThat(c).doesNotHaveBean(LocalWorldAi.class).doesNotHaveBean(AiText.class));
 }
 @ParameterizedTest @ValueSource(strings={"local,db","dev,db,ai-park"})
 void localFixturesKeepTheirSeparateBootstrap(String profiles){
  runtime().withPropertyValues("spring.profiles.active="+profiles,"ontop.ai.enabled=true")
   .run(c->assertThat(c).doesNotHaveBean(LocalWorldAi.class));
 }
}
