package com.ssafy.ontop.ai;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class OmokResidentsTests {
    @Test void eachDifficultyOwnsOneDistinctResidentAndSeveralTruthfulLines(){
        var ids=new HashSet<String>();
        for(var difficulty:LocalCompanions.Difficulty.values()){
            var r=OmokResident.forDifficulty(difficulty);ids.add(r.id("one"));assertThat(r.difficulty).isEqualTo(difficulty.name());
            var openings=new HashSet<String>();var comments=new HashSet<String>();
            for(int i=0;i<3;i++){openings.add(r.opening(i));comments.add(r.observation(i,OmokAnalyzer.unavailable()));}
            assertThat(openings).hasSize(3);assertThat(comments).hasSize(3);
            assertThat(String.join(" ",comments)).doesNotContain("흑 쪽","백 쪽","%","승률");
        }
        assertThat(ids).hasSize(3);
    }
    @Test void atMostTwoWatchersPerGameAndOneTargetPerBody(){
        var actors=List.of("child","neighbor","elder");
        var one=OmokCrowd.assign(Map.of(),actors,List.of("game1"));assertThat(one).hasSize(2);assertThat(one.values()).containsOnly("game1");
        var two=OmokCrowd.assign(one,actors,List.of("game1","game2"));assertThat(two).hasSize(3);
        one.forEach((actor,game)->assertThat(two).containsEntry(actor,game));
        assertThat(Collections.frequency(new ArrayList<>(two.values()),"game1")).isEqualTo(2);
        var busy=OmokCrowd.assign(two,List.of("elder"),List.of("game2"));assertThat(busy).containsExactlyEntriesOf(Map.of("elder","game2"));
        assertThat(OmokCrowd.assign(two,actors,List.of())).isEmpty();
    }
}
