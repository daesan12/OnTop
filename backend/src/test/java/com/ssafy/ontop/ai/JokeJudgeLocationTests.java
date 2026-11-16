package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.config.WorldMapProperties;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class JokeJudgeLocationTests {
    @Test void explicitJudgeAnchorUsesItsOwnGroundHeightAndCoordinates(@org.junit.jupiter.api.io.TempDir Path directory)
            throws Exception {
        var file = directory.resolve("park.json");
        Files.writeString(file, """
                {"data":{"interactions":{
                  "rankingBoard":{"reachPosition":[100,0.8,200]},
                  "jokeJudge":[96,4.88,200]
                }}}
                """);
        var properties = new WorldMapProperties(WorldMapProperties.Source.GENERATED, file.toString(), "fixture", true);
        assertThat(JokeJudgeLocation.load(new ObjectMapper(), properties)).isEqualTo(new JokeJudgeLocation(96, 4.88, 200));
    }

    @Test void anchorIsPackagedInsideBackendAndMatchesBrowserMap()throws Exception{
        var mapper=new ObjectMapper();var location=JokeJudgeLocation.load(mapper,new WorldMapProperties(null,null,null,false));
        assertThat(getClass().getResource("/ai/joke-map.json")).isNotNull();
        var browser=Path.of("../frontend/generated/park/server-map.json");
        if(Files.exists(browser)){
            var anchor=mapper.readTree(browser.toFile()).at("/data/interactions/rankingBoard/reachPosition");
            assertThat(location).isEqualTo(new JokeJudgeLocation(anchor.get(0).asDouble()-4,anchor.get(1).asDouble(),anchor.get(2).asDouble()));
        }
    }
    @Test void selectedGeneratedMapOverridesBundledLegacyAnchor()throws Exception{
        var file=Files.createTempFile("joke-map-", ".json");try{
            Files.writeString(file,"{\"data\":{\"interactions\":{\"rankingBoard\":{\"reachPosition\":[100,0.8,200]}}}}");
            assertThat(JokeJudgeLocation.load(new ObjectMapper(),new WorldMapProperties(WorldMapProperties.Source.GENERATED,file.toString(),"fixture",true)))
                .isEqualTo(new JokeJudgeLocation(96,.8,200));
        }finally{Files.delete(file);}
    }
}
