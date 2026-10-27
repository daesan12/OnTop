package com.ssafy.ontop.table;
import static org.assertj.core.api.Assertions.*;
import com.ssafy.ontop.table.domain.*;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
class TabletPolicyTests {
    final Instant now=Instant.parse("2026-10-27T00:00:00Z");
    @ParameterizedTest @ValueSource(ints={2,3,4})
    void 선택정원_전원이_필요하고_동일설정과중복준비는_기한을유지한다(int players) {
        var room=new TableRoom("t"); room.join("1"); room.configure(TableGame.ONE_CARD,null,10,players);
        room.setReady("1",true); room.refreshWait(now,true);
        assertThat(room.snapshot().allReady()).isFalse();
        for(int n=2;n<=players;n++)room.join(""+n);
        for(int n=1;n<=players;n++)room.setReady(""+n,true);
        room.refreshWait(now,true); var first=room.hostWait(now);
        assertThat(first.expiresAt()).isEqualTo(now.plusSeconds(120).toEpochMilli());
        assertThat(room.configure(TableGame.ONE_CARD,null,10,players)).isFalse();
        assertThat(room.setReady("1",true)).isFalse(); room.refreshWait(now.plusSeconds(5),true);
        assertThat(room.hostWait(now).expiresAt()).isEqualTo(first.expiresAt());
        assertThat(room.expireWait(now.plusSeconds(119))).isNull();
        assertThat(room.expireWait(now.plusSeconds(120))).isNotNull();
        assertThat(room.expireWait(now.plusSeconds(121))).isNull();
        assertThat(room.snapshot().seats()).allSatisfy(s->assertThat(s.ready()).isFalse());
        assertThat(room.snapshot().selectorUserId()).isIn(Set.of("2","3","4").stream().filter(id->Integer.parseInt(id)<=players).toArray());
    }
    @Test void 잘못된설정은_현재게임과준비에_부분반영하지않는다() {
        var room=new TableRoom("t");room.join("1");room.join("2");room.configure(TableGame.DICE,4000,10,2);
        room.setReady("1",true);var before=room.snapshot();
        assertThatThrownBy(()->room.configure(TableGame.OMOK,null,10,3)).isInstanceOf(IllegalArgumentException.class);
        assertThat(room.snapshot()).isEqualTo(before);
        assertThatThrownBy(()->room.configure(TableGame.DICE,3000,10,2)).isInstanceOf(IllegalArgumentException.class);
        assertThat(room.snapshot()).isEqualTo(before);
    }
    @Test void 공동승자는_남은승자중에서만_부재승자와무효는_남은좌석중에서_선택한다() {
        var room=new TableRoom("t");room.join("1");room.join("2");room.join("3");
        for(int n=0;n<20;n++){room.chooseHost(Set.of("2","3"));assertThat(room.snapshot().selectorUserId()).isIn("2","3");}
        room.leave("3");room.chooseHost(Set.of("3"));assertThat(room.snapshot().selectorUserId()).isIn("1","2");
        room.leave("1");room.leave("2");room.chooseHost(Set.of());assertThat(room.snapshot().selectorUserId()).isNull();
        assertThat(new TableRoom("t").hostWait(now).expiresAt()).isNull();
    }
}
