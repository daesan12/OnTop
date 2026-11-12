package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import java.nio.file.Path;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;

@Configuration(proxyBeanMethods=false)
@Profile("("+RuntimeProfiles.PRODUCT_FEATURE_WITH_DB+") & !local & !ai-park")
@ConditionalOnProperty(name="ontop.ai.enabled",havingValue="true")
public class ResidentServiceConfiguration {
    @Bean(initMethod="start",destroyMethod="close")
    @ConditionalOnProperty(name="ontop.ai.residents-enabled",havingValue="true",matchIfMissing=true)
    LocalCompanions residentCompanions(TableHub hub,ObjectMapper mapper,LocalWorldAi ai,WorldMapRuntime map,
            ObjectProvider<OmokEngine> engines,AiText texts,@Value("${AI_RAPFI_PATH:}") String binary){
        OmokAnalyzer analyzer=binary.isBlank()?(board,moves)->OmokAnalyzer.unavailable():new RapfiAnalyzer(Path.of(binary),300);
        var companions=new LocalCompanions(hub,mapper,Clock.systemUTC(),analyzer,texts,
                ()->new com.ssafy.ontop.world.movement.ParkNavigation(map.scene()));
        var engine=engines.getIfAvailable();if(engine!=null)companions.observe(engine::analysisPositions);
        return companions;
    }
}
