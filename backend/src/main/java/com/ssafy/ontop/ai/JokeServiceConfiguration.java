package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;

@Configuration(proxyBeanMethods=false)
@Profile("("+RuntimeProfiles.PRODUCT_FEATURE_WITH_DB+") & !local & !ai-park")
@ConditionalOnProperty(name={"ontop.ai.enabled","ontop.ai.joke-enabled"},havingValue="true")
public class JokeServiceConfiguration {
    @Bean JokeJudgeLocation jokeJudgeLocation(ObjectMapper mapper,com.ssafy.ontop.world.config.WorldMapProperties map)throws java.io.IOException{return JokeJudgeLocation.load(mapper,map);}
    @Bean(destroyMethod="close")
    @org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization
    LocalJokeContest jokeContest(ObjectMapper mapper,DataSource source,AiText text,
            @Value("${JEV_API_KEY:}") String jevKey,@Value("${JEV_MODEL:jev-1.14.0}") String jevModel,
            @Value("${OPENAI_API_KEY:}") String llmKey,
            @Value("${AI_LLM_MODEL:${AI_LAB_LLM_MODEL:gpt-4.1-mini}}") String model){
        // Never publish fixture scores in the service. Missing providers refund the attempt.
        JokeJudge guard=new JevJokeJudge(mapper,jevKey,jevModel);
        JokeJudge judge=llmKey.isBlank()?new JokeJudge(){
            public Evaluation evaluate(String q,String a){throw new IllegalStateException("LLM 심사 키가 필요합니다.");}
            public boolean safeReaction(String value){return false;}
            public String mode(){return "LLM_UNCONFIGURED";}
        }:new LlmJokeJudge(mapper,llmKey,model,guard);
        return new LocalJokeContest(mapper,new JdbcJokeContestStore(source,mapper),judge,text,Clock.systemUTC());
    }
}
