package com.ssafy.ontop.ai;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class NpcAmbientTests {
    @Test void idleSpeechIsShortLivedSpacedAndRotatesInsteadOfRepeating() {
        for(String persona:List.of("POLICE","CHILD","NEIGHBOR","ELDER")) {
            var ambient=new NpcAmbient();assertThat(ambient.tick("actor",persona,true,0)).isNull();
            var lines=new HashSet<String>();
            for(int i=0;i<5;i++) {
                long now=20_000L+i*40_000;var bubble=ambient.tick("actor",persona,true,now);
                assertThat(bubble).isNotNull();lines.add(bubble.text());
                assertThat(ambient.tick("actor",persona,true,now+5999)).isEqualTo(bubble);
                assertThat(ambient.tick("actor",persona,true,now+6000)).isNull();
            }
            assertThat(lines).hasSize(5);
        }
    }
    @Test void respondingOrPlayingCancelsTheBubbleAndRestartingIdleDoesNotSpeakImmediately() {
        var ambient=new NpcAmbient();ambient.tick("police","POLICE",true,0);
        assertThat(ambient.tick("police","POLICE",true,20_000)).isNotNull();
        assertThat(ambient.tick("police","POLICE",false,21_000)).isNull();
        assertThat(ambient.tick("police","POLICE",true,21_001)).isNull();
        assertThat(ambient.tick("police","POLICE",true,40_000)).isNotNull();
        ambient.retain(Set.of());assertThat(ambient.tick("police","POLICE",true,40_001)).isNull();
    }
}
