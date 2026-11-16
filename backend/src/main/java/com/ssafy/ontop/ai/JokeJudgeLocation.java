package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.config.WorldMapProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** The judge's interaction point comes from the same map as the browser. */
public record JokeJudgeLocation(double x,double y,double z) {
    public static JokeJudgeLocation load(ObjectMapper mapper,WorldMapProperties properties)throws IOException{
        try(var input=properties.source()==WorldMapProperties.Source.GENERATED?Files.newInputStream(Path.of(properties.jsonPath())):
                JokeJudgeLocation.class.getResourceAsStream("/ai/joke-map.json")){
            if(input==null)throw new IOException("아재왕 맵 앵커가 없습니다.");
            var interactions = mapper.readTree(input).path("data").path("interactions");
            var judge = interactions.path("jokeJudge");
            boolean explicit = !judge.isMissingNode();
            var anchor = explicit ? judge : interactions.path("rankingBoard").path("reachPosition");
            if(!anchor.isArray()||anchor.size()!=3)throw new IOException("아재왕 맵 앵커를 확인해주세요.");
            for(var n:anchor)if(!n.isNumber()||!Double.isFinite(n.asDouble()))throw new IOException("유효하지 않은 아재왕 좌표");
            return new JokeJudgeLocation(anchor.get(0).asDouble() - (explicit ? 0 : 4),
                    anchor.get(1).asDouble(), anchor.get(2).asDouble());
        }
    }
}
