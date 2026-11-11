package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;

/** Opt-in runtime wiring. Local fixture profiles and controls are never enabled here. */
@Configuration(proxyBeanMethods=false)
@Profile("("+RuntimeProfiles.PRODUCT_FEATURE_WITH_DB+") & !local & !ai-park")
@ConditionalOnProperty(name="ontop.ai.enabled",havingValue="true")
public class WorldAiConfiguration {
 @Bean @org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean(AiStore.class)
 @org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization
 AiStore aiStore(DataSource source,ObjectMapper mapper){return new JdbcAiStore(source,mapper);}
 @Bean AiText aiText(@Value("${OPENAI_API_KEY:}") String key,
   @Value("${AI_LLM_MODEL:${AI_LAB_LLM_MODEL:gpt-4.1-mini}}") String model,
   @Value("${AI_LLM_DAILY_CALLS:${AI_LAB_LLM_DAILY_CALLS:100}}") int limit) {
  return key.isBlank()?AiText.fixed():new OpenAiText(key,model,limit);
 }
 @Bean(destroyMethod="close") LocalWorldAi worldAi(ObjectMapper mapper,TableHub hub,WorldMapRuntime map,AiStore store,
   JumpmapActivation jumpmap,AiText text,
   @Value("${AI_JEV_ENABLED:true}") boolean liveJev,@Value("${JEV_API_KEY:}") String key,
   @Value("${JEV_MODEL:jev-1.14.0}") String model,
   @Value("${AI_MM_ENABLED:false}") boolean liveMm,
   @Value("${AI_MM_WEBHOOK:${AI_LAB_MM_WEBHOOK:}}") String webhook,
   @Value("${AI_POLICE_ENABLED:true}") boolean police) {
  return new LocalWorldAi(store,liveJev?new JevDecisions(mapper,key,model):new OfflineDecisions(),
   liveMm?new MattermostNotifier(webhook,mapper):AiNotifier.local(),hub,
   police?()->new com.ssafy.ontop.world.movement.ParkNavigation(map.scene(),jumpmap.course().orElse(null)):null,true,text);
 }
 @Bean FeedbackEvents worldAiFeedbackEvents(LocalWorldAi ai){return new FeedbackEvents(ai);}
 public record FeedbackEvents(LocalWorldAi ai){@EventListener public void submitted(WorldAiBridge.Feedback event){ai.feedback(event);}}
}
