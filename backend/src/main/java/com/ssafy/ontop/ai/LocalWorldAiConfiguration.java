package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;

@Configuration(proxyBeanMethods=false)
@Profile("local & ai-park & !dev & !prod & !production")
public class LocalWorldAiConfiguration {
    @Bean(destroyMethod="close")
    LocalWorldAi localWorldAi(ObjectMapper mapper, TableHub hub, com.ssafy.ontop.world.map.WorldMapRuntime map,
            org.springframework.beans.factory.ObjectProvider<AiText> texts,
            com.ssafy.ontop.world.jumpmap.JumpmapActivation jumpmap,
            @Value("${ontop.ai.directory:.gradle/ai-park}") String directory,
            @Value("${ontop.ai.live-jev:false}") boolean liveJev,
            @Value("${JEV_API_KEY:}") String key,
            @Value("${ontop.ai.jev-model:jev-1.14.0}") String model,
            @Value("${ontop.ai.live-mattermost:false}") boolean liveMattermost,
            @Value("${ontop.ai.npc-enabled:true}") boolean npcEnabled,
            @Value("${AI_LAB_MM_WEBHOOK:}") String webhook,
            @Value("${server.address:}") String address) throws java.io.IOException {
        if(!java.util.List.of("127.0.0.1","::1","localhost").contains(address))
            throw new IllegalArgumentException("AI 로컬 연결은 loopback 바인딩이 필요합니다.");
        var ai=new LocalWorldAi(mapper,Path.of(directory),liveJev?new JevDecisions(mapper,key,model):new OfflineDecisions(),
                liveMattermost?new MattermostNotifier(webhook,mapper):AiNotifier.local(),hub,
                npcEnabled?() -> new com.ssafy.ontop.world.movement.ParkNavigation(map.scene(),jumpmap.course().orElse(null)):null,true,texts.getIfAvailable(AiText::fixed));
        return ai;
    }
    @Bean
    FeedbackListener aiFeedbackListener(LocalWorldAi ai) { return new FeedbackListener(ai); }
    public record FeedbackListener(LocalWorldAi ai) {
        @EventListener public void submitted(WorldAiBridge.Feedback feedback) { ai.feedback(feedback); }
    }
}
