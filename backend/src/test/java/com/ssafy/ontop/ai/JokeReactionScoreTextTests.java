package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.Clock;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class JokeReactionScoreTextTests {
    @TempDir Path directory;

    @ParameterizedTest
    @ValueSource(strings={"1+1을 창문 모양으로 연결했네.","숫자 1을 두 개 놓은 모양이구먼.","반전이 약해 점수가 조금 아쉽구먼.","이점과 관점을 바꿔 본 재치가 있네.","１＋１의 모양을 살렸네.","1점프씩 이어진다는 말장난이네.","1/2을 반으로 읽는 연결이네."})
    void jokeNumbersAndQualitativeAssessmentReachTheGuardUnchanged(String reaction)throws Exception {
        var guarded=new AtomicReference<String>();
        var done=evaluate(reaction,true,guarded);
        assertThat(guarded.get()).isEqualTo(reaction);
        assertThat(done.reactionSource()).isEqualTo("SPRING_AI");
        assertThat(done.reaction()).contains(reaction).containsOnlyOnce("32.0점일세!");
        assertThat(done.scoreX10()).isEqualTo(320);
    }

    @ParameterizedTest
    @ValueSource(strings={"이번 개그는 32점일세.","총점은 32.5라네.","３２．５점일세.","score: 32", "좋아, 32 points!", "삼십이 점일세.","백 점일세.","만점을 주겠네.","점수는 이 점일세.","이번 개그는 32/100일세.","32 out of 100"})
    void modelScoreClaimsUseFallbackWithoutChangingTheCalculatedScore(String reaction)throws Exception {
        var guarded=new AtomicReference<String>();
        var done=evaluate(reaction,true,guarded);
        assertThat(guarded.get()).isNull();
        assertThat(done.reactionSource()).isEqualTo("FIXED");
        assertThat(done.reaction()).doesNotContain(reaction).containsOnlyOnce("32.0점일세!");
        assertThat(done.scoreX10()).isEqualTo(320);
    }

    @Test void permittingNumbersDoesNotBypassTheSafetyGuard()throws Exception {
        var guarded=new AtomicReference<String>();String reaction="1+1을 연결한 검수 대상 문구";
        var done=evaluate(reaction,false,guarded);
        assertThat(guarded.get()).isEqualTo(reaction);
        assertThat(done.reactionSource()).isEqualTo("FIXED");
        assertThat(done.reaction()).doesNotContain(reaction);
    }

    private LocalJokeContest.Submission evaluate(String reaction,boolean safe,AtomicReference<String> guarded)throws Exception {
        var mapper=new ObjectMapper();
        JokeJudge judge=new JokeJudge(){
            public Evaluation evaluate(String q,String a){return new Evaluation("SCORED",150,120,50,"해석",reaction,true);}
            public boolean safeReaction(String text){guarded.set(text);return safe;}
            public String mode(){return "score-text-test";}
        };
        try(var contest=new LocalJokeContest(mapper,new JsonJokeContestStore(mapper,directory.resolve(UUID.randomUUID().toString()),System.currentTimeMillis()),judge,AiText.fixed(),Clock.systemUTC())){
            var row=contest.submit("test","시험","1+1은?","창문","score-text-test",true);
            for(int i=0;i<500;i++){
                var done=contest.own("test",row.id());
                if(!done.status().equals("PENDING"))return done;
                Thread.sleep(5);
            }
            throw new AssertionError("contest did not complete");
        }
    }
}
