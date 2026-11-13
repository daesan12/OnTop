package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.assertj.core.api.Assertions.*;

/** Explicit opt-in only: paid/provider-side Korean quality observations, never run by normal builds. */
@EnabledIfEnvironmentVariable(named="AI_JOKE_LIVE_QUALITY",matches="true")
class JevJokeQualityTests {
    @Test void recordsThirtyKoreanCasesWithoutTreatingProbabilityAsHumorScore()throws Exception{
        String key=System.getenv("JEV_API_KEY");assertThat(key).as("키는 실행한 터미널에 필요합니다").isNotBlank();
        var mapper=new ObjectMapper();var cases=mapper.readTree(getClass().getResourceAsStream("/ai/joke-quality-cases.json"));assertThat(cases.size()).isEqualTo(30);
        int repeat=Integer.parseInt(System.getenv().getOrDefault("AI_JOKE_QUALITY_REPEAT","1"));assertThat(repeat).isBetween(1,3);
        var judge=new JevJokeJudge(mapper,key,"jev-1.14.0");var rows=new ArrayList<Map<String,Object>>();
        Path out=Path.of("build/joke-quality/live-"+System.currentTimeMillis()+".json");Files.createDirectories(out.getParent());
        for(var sample:cases)for(int attempt=0;attempt<repeat;attempt++) {
            long start=System.nanoTime();var row=new LinkedHashMap<String,Object>();row.put("id",sample.path("id").asText());row.put("expected",sample.path("expected").asText());row.put("attempt",attempt+1);
            try{var result=judge.evaluate(sample.path("question").asText(),sample.path("answer").asText());row.put("result",result);row.put("scoreX10",result.wordplayX10()+result.witX10()+result.originalityX10());}
            catch(RuntimeException failure){row.put("error",failure.getClass().getSimpleName());}
            row.put("elapsedMs",(System.nanoTime()-start)/1_000_000);rows.add(row);mapper.writerWithDefaultPrettyPrinter().writeValue(out.toFile(),rows);
        }
        System.out.println("Jev 한국어 품질 관찰 파일: "+out+" (완료는 전체 정확도 통과를 뜻하지 않음)");
    }
}
