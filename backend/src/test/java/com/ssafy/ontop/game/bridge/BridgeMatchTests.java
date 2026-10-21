package com.ssafy.ontop.game.bridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.bridge.domain.BridgeMatch;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class BridgeMatchTests {
    private final ObjectMapper mapper=new ObjectMapper();
    private Instant now=Instant.parse("2026-10-21T00:00:00Z");
    private int face=0;
    private int sequence;
    private BridgeMatch match=new BridgeMatch("bridge","table",List.of(101L,202L,303L,404L),0,now,() -> face);

    @Test
    void 실제눈은본인에게만_모두믿으면끝까지비공개이고_재굴림은거절한다() {
        act(101,"roll");
        assertThat(match.privateFace(101)).isZero();
        assertThat(match.privateFace(202)).isNull();
        assertThat(match.privateFace(505)).isNull();
        assertThatThrownBy(() -> act(101,"roll")).isInstanceOf(Rejected.class);
        act(101,"declare",4);
        assertThat(match.snapshot().responseOrder()).containsExactly(202L,303L,404L);
        assertThatThrownBy(() -> act(303,"doubt")).isInstanceOf(Rejected.class);
        act(202,"trust"); act(303,"trust"); act(404,"trust");
        assertThat(active(101)).isEqualTo(4);
        assertThat(match.snapshot().resolution().challenged()).isFalse();
        assertThat(match.snapshot().resolution().actualFace()).isNull();
        assertThat(match.privateFace(101)).isNull();
        assertThatThrownBy(() -> act(101,"roll")).isInstanceOf(Rejected.class);
        now=now.plusMillis(1500); match.expire(now);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
    }

    @Test
    void 거짓다우트성공은선언자추락_도전자이동_원자연산순서다() {
        face=1; act(101,"roll"); act(101,"declare",4); act(202,"doubt");
        var state=match.snapshot();
        assertThat(state.resolution().wasBluff()).isTrue();
        assertThat(state.resolution().actualFace()).isEqualTo(1);
        assertThat(state.resolution().operations().stream().map(BridgeMatch.Operation::type))
                .containsExactly("FALL_PAWN","MOVE_PAWN","SPAWN_PAWN");
        assertThat(active(101)).isZero(); assertThat(active(202)).isEqualTo(4);
        assertInvariants();
    }

    @Test
    void 진실다우트실패는도전자추락_선언자이동이다() {
        face=4; act(101,"roll"); act(101,"declare",4); act(202,"doubt");
        assertThat(match.snapshot().resolution().wasBluff()).isFalse();
        assertThat(active(101)).isEqualTo(4); assertThat(active(202)).isZero();
        assertInvariants();
    }

    @Test
    void 차례마다30초_굴림과선언만료는넘김_심사만료는다음판단자다() {
        var start=now;
        now=start.plusSeconds(30); match.expire(now);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
        assertThat(match.privateFace(202)).isNull();
        act(202,"roll");
        assertThat(match.snapshot().turnDeadline()).isEqualTo(start.plusSeconds(60));
        now=start.plusSeconds(60); match.expire(now);
        assertThat(match.snapshot().turnUserId()).isEqualTo(303);
        assertThat(match.privateFace(202)).isNull();
        act(303,"roll"); act(303,"declare",3);
        now=now.plusSeconds(30); match.expire(now);
        assertThat(match.snapshot().responderUserId()).isEqualTo(101);
        assertThat(match.snapshot().acceptedBy()).containsExactly(404L);
        now=now.plusSeconds(60); match.expire(now);
        assertThat(active(303)).isEqualTo(3);
        assertThat(match.snapshot().resolution().actualFace()).isNull();
    }

    @Test
    void 정각입력과늦은단계버전_중복행동과내용충돌을검사한다() {
        var command=new GameActionCommand(101,"bridge","roll",0,mapper.valueToTree(Map.of("kind","roll")));
        var first=match.apply(command,now);
        assertThat(match.apply(command,now)).isEqualTo(first);
        assertThatThrownBy(() -> match.apply(new GameActionCommand(101,"bridge","roll",0,
                mapper.valueToTree(Map.of("kind","declare","value",1))),now)).isInstanceOf(Rejected.class);
        assertThatThrownBy(() -> match.apply(new GameActionCommand(101,"bridge","old",0,
                mapper.valueToTree(Map.of("kind","declare","value",1))),now)).isInstanceOf(Rejected.class);
        now=now.plusSeconds(30);
        assertThatThrownBy(() -> act(101,"declare",1)).isInstanceOf(Rejected.class);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
        assertThat(match.snapshot().resolution()).isNull();
        assertThatThrownBy(() -> match.apply(new GameActionCommand(202,"bridge","forge",match.snapshot().version(),
                mapper.valueToTree(Map.of("kind","roll","face",4))),now)).isInstanceOf(Rejected.class);
    }

    @Test
    void 기권은진행선언판정뒤에_현재심사자는자동믿기_골인슬롯은영구발급한다() {
        match=new BridgeMatch("bridge","table",List.of(101L,202L),0,now,() -> 4);
        // 양쪽이 한 번씩 4,4,4 이동해 슬롯1/2를 얻는다.
        for (int i=0;i<6;i++) { trustedTurn(4); }
        assertThat(match.snapshot().nextGoalSlot()).isEqualTo(3);
        assertThat(player(101).score()).isEqualTo(1);
        assertThat(player(202).score()).isEqualTo(2);
        act(101,"roll"); act(101,"declare",4);
        match.forfeit(101,now);
        assertThat(player(101).pendingForfeit()).isTrue();
        assertThat(player(101).forfeited()).isFalse();
        assertThat(match.privateFace(101)).isNull();
        act(202,"doubt");
        var end=match.snapshot();
        assertThat(end.endReason()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(end.winnerUserIds()).containsExactly(202L);
        assertThat(end.goalSlots().getFirst().status()).isEqualTo("VACATED");
        assertThat(end.goalSlots().get(1).status()).isEqualTo("OCCUPIED");
        assertThat(end.nextGoalSlot()).isEqualTo(3);
        assertThat(end.resolution().operations().stream().map(BridgeMatch.Operation::type))
                .containsSubsequence("FALL_PAWN","MOVE_PAWN","VACATE_GOAL_SLOT","FORFEIT_PLAYER");
        assertInvariants();
    }

    @Test
    void 미선언중기권은30초넘김경계에반영하고_모두기권은무승자다() {
        act(101,"roll");
        for (long user : List.of(101L,202L,303L,404L)) { match.forfeit(user,now); }
        assertThat(match.snapshot().endedAt()).isNull();
        now=now.plusSeconds(30); match.expire(now);
        assertThat(match.snapshot().endReason()).isEqualTo("ABORTED_NO_PLAYERS");
        assertThat(match.snapshot().winnerUserIds()).isEmpty();
        assertInvariants();
    }

    @Test
    void 심사기권은바로믿고_추가명령은막으며_같은타이머를다시적용하지않는다() {
        act(101,"roll"); act(101,"declare",2);
        match.forfeit(202,now); match.forfeit(202,now);
        assertThat(match.snapshot().responderUserId()).isEqualTo(303);
        assertThatThrownBy(() -> act(202,"doubt")).isInstanceOf(Rejected.class);
        act(303,"trust"); act(404,"trust");
        assertThat(player(202).forfeited()).isTrue();
        var state=match.snapshot(); match.expire(now);
        assertThat(match.snapshot()).isEqualTo(state);
        assertInvariants();
    }

    @Test
    void 세개골인즉시승리_말겹침과초과이동은다음말로전달하지않는다() {
        match=new BridgeMatch("bridge","table",List.of(101L,202L),0,now,() -> 4);
        for (int i=0;i<16;i++) { trustedTurn(4); }
        // 17번째 차례에101의 세번째 말 골인.
        assertThat(match.snapshot().turnUserId()).isEqualTo(101);
        act(101,"roll"); act(101,"declare",4); act(202,"trust");
        var end=match.snapshot();
        assertThat(end.endReason()).isEqualTo("THREE_GOALS");
        assertThat(player(101).goals()).isEqualTo(3);
        assertThat(end.winnerUserIds()).containsExactly(101L);
        assertThat(end.turnDeadline()).isNull();
        long version=end.version(); match.forfeit(101,now); match.expire(now.plusSeconds(300));
        assertThat(match.snapshot().version()).isEqualTo(version);
        assertInvariants();
    }

    @Test
    void 골인말만있는도전자실패는최저슬롯제거하고_그번호는재사용하지않는다() {
        scoredOnlyOpponent();
        face=1; act(101,"roll"); act(101,"declare",1); act(202,"doubt");
        assertThat(player(202).score()).isEqualTo(4);
        assertThat(player(202).goals()).isEqualTo(1);
        assertThat(match.snapshot().goalSlots().get(1).status()).isEqualTo("VACATED");
        assertThat(match.snapshot().nextGoalSlot()).isEqualTo(5);
        now=match.snapshot().turnDeadline(); match.expire(now);
        assertThat(match.snapshot().turnUserId()).isEqualTo(101); //202는골인말뿐이라자기차례없음
        act(101,"roll"); act(101,"declare",4); act(202,"trust");
        assertThat(match.snapshot().goalSlots().get(4).userId()).isEqualTo(101);
        assertThat(match.snapshot().goalSlots().get(1).status()).isEqualTo("VACATED");
        assertThat(match.snapshot().endReason()).isEqualTo("THREE_GOALS");
        assertInvariants();
    }

    @Test
    void 골인말만있는도전자성공은상대만추락시키고_보상말을만들지않는다() {
        scoredOnlyOpponent();
        face=0; act(101,"roll"); act(101,"declare",4); act(202,"doubt");
        assertThat(player(202).score()).isEqualTo(6);
        assertThat(player(202).pawns()).noneMatch(p -> p.status().equals("ACTIVE"));
        assertThat(match.snapshot().nextGoalSlot()).isEqualTo(5);
        assertThat(match.snapshot().resolution().operations().stream().map(BridgeMatch.Operation::type))
                .doesNotContain("MOVE_PAWN","SCORE_PAWN");
        assertInvariants();
    }

    @Test
    void 여덟번째슬롯과세번째골인이동시에발생하면세골인승리가우선이다() {
        sevenSlots();
        while (match.snapshot().endedAt()==null) {
            if (match.snapshot().turnUserId()==101) { trustedTurn(4); }
            else { now=match.snapshot().turnDeadline(); match.expire(now); }
        }
        assertThat(match.snapshot().nextGoalSlot()).isEqualTo(9);
        assertThat(match.snapshot().endReason()).isEqualTo("THREE_GOALS");
        assertThat(match.snapshot().winnerUserIds()).containsExactly(101L);
        assertInvariants();
    }

    @Test
    void 여덟번째발급직후같은판정에서기권제거해도슬롯소진종료를유지한다() {
        sevenSlots();
        assertThat(match.snapshot().turnUserId()).isEqualTo(404);
        act(404,"roll"); act(404,"declare",1); match.forfeit(404,now);
        act(101,"trust"); act(202,"trust"); act(303,"trust");
        assertThat(match.snapshot().nextGoalSlot()).isEqualTo(9);
        assertThat(match.snapshot().goalSlots().get(7).status()).isEqualTo("VACATED");
        assertThat(match.snapshot().endReason()).isEqualTo("GOAL_SLOTS_EXHAUSTED");
        assertThat(match.snapshot().winnerUserIds()).containsExactly(303L);
        assertInvariants();
    }

    @Test
    void 말이다소진된사람은기권과다르며_심사자없음은대기없이전진한다() {
        match=new BridgeMatch("bridge","table",List.of(101L,202L),0,now,() -> 0);
        for (int i=0;i<7;i++) {
            act(101,"roll"); act(101,"declare",1); act(202,"doubt");
            now=match.snapshot().turnDeadline(); match.expire(now);
            if (i<6) { now=match.snapshot().turnDeadline(); match.expire(now); }
        }
        assertThat(player(101).pawns()).noneMatch(p -> List.of("ACTIVE","RESERVE","SCORED").contains(p.status()));
        assertThat(player(101).forfeited()).isFalse();
        act(202,"roll"); act(202,"declare",1);
        assertThat(match.snapshot().stage()).isEqualTo("RESOLVING");
        assertThat(match.snapshot().responseOrder()).isEmpty();
        assertThat(match.snapshot().resolution().actualFace()).isNull();
        assertThat(match.snapshot().endReason()).isNull();
        assertThatThrownBy(() -> act(101,"doubt")).isInstanceOf(Rejected.class);
        assertInvariants();
    }

    @Test
    void 입력없는장기경과는난수없이빠르게넘기고_마감과차례를유지한다() {
        now=now.plusSeconds(30L*1_000_001); match.expire(now);
        assertThat(match.snapshot().version()).isEqualTo(1_000_001);
        assertThat(match.snapshot().turnId()).isEqualTo(1_000_002);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(now.plusSeconds(30));
    }

    @Test
    void 무작위2에서4인경기를반복해_말수와슬롯점수비밀불변식을검사한다() {
        var random=new java.util.Random(20931);
        for (int run=0;run<1000;run++) {
            int size=2+random.nextInt(3);
            match=new BridgeMatch("bridge","table",List.of(101L,202L,303L,404L).subList(0,size),0,now,
                    () -> { int n=random.nextInt(6); return n<4 ? n+1 : 0; });
            for (int step=0;match.snapshot().endedAt()==null && step<3000;step++) {
                var state=match.snapshot();
                switch (state.stage()) {
                    case "AWAITING_ROLL" -> act(state.turnUserId(),"roll");
                    case "DECLARING" -> act(state.turnUserId(),"declare",1+random.nextInt(4));
                    case "RESPONDING" -> act(state.responderUserId(),random.nextBoolean() ? "trust" : "doubt");
                    case "RESOLVING" -> { now=state.turnDeadline(); match.expire(now); }
                    default -> throw new AssertionError(state.stage());
                }
                assertInvariants();
            }
            assertThat(match.snapshot().endedAt()).as("run=%s",run).isNotNull();
        }
    }

    private void trustedTurn(int value) {
        long actor=match.snapshot().turnUserId(); act(actor,"roll"); act(actor,"declare",value);
        while (match.snapshot().stage().equals("RESPONDING")) { act(match.snapshot().responderUserId(),"trust"); }
        if (match.snapshot().stage().equals("RESOLVING")) { now=match.snapshot().turnDeadline(); match.expire(now); }
    }
    private void scoredOnlyOpponent() {
        match=new BridgeMatch("bridge","table",List.of(101L,202L),0,now,() -> face);
        for (int i=0;i<12;i++) { trustedTurn(4); }
        for (int i=0;i<5;i++) {
            now=match.snapshot().turnDeadline(); match.expire(now); //101이동없이넘김
            face=0; act(202,"roll"); act(202,"declare",1); act(101,"doubt");
            now=match.snapshot().turnDeadline(); match.expire(now);
        }
        assertThat(player(202).goals()).isEqualTo(2);
        assertThat(player(202).pawns()).noneMatch(p -> List.of("ACTIVE","RESERVE").contains(p.status()));
        assertThat(active(101)).isEqualTo(5);
        assertInvariants();
    }
    private void sevenSlots() {
        while (match.snapshot().nextGoalSlot()<8) { trustedTurn(4); }
        assertThat(match.snapshot().endedAt()).isNull();
        assertInvariants();
    }
    private void act(long user,String kind) { act(user,kind,null); }
    private void act(long user,String kind,Integer value) {
        match.apply(new GameActionCommand(user,"bridge","action-"+(++sequence),match.snapshot().version(),
                mapper.valueToTree(value==null ? Map.of("kind",kind) : Map.of("kind",kind,"value",value))),now);
    }
    private BridgeMatch.PlayerView player(long user) { return match.snapshot().publicPlayers().stream().filter(p -> p.userId()==user).findFirst().orElseThrow(); }
    private int active(long user) { return player(user).pawns().stream().filter(p -> p.status().equals("ACTIVE")).findFirst().orElseThrow().position(); }
    private void assertInvariants() {
        var state=match.snapshot();
        assertThat(state.goalSlots()).hasSize(8); assertThat(state.nextGoalSlot()).isBetween(1,9);
        for (var player : state.publicPlayers()) {
            assertThat(player.pawns()).hasSize(7);
            assertThat(player.pawns().stream().filter(p -> p.status().equals("ACTIVE")).count()).isLessThanOrEqualTo(1);
            var occupied=state.goalSlots().stream().filter(s -> s.status().equals("OCCUPIED") && s.userId()==player.userId()).toList();
            assertThat(player.goals()).isEqualTo(occupied.size());
            assertThat(player.score()).isEqualTo(occupied.stream().mapToInt(BridgeMatch.SlotView::slot).sum());
            assertThat(player.pawns().stream().filter(p -> p.status().equals("SCORED")).count()).isEqualTo(player.goals());
            for (var slot : occupied) {
                assertThat(player.pawns()).anyMatch(p -> p.id()==slot.pawnId() && p.status().equals("SCORED") && p.goalSlot()==slot.slot());
            }
            if (player.forfeited()) { assertThat(player.pawns()).noneMatch(p -> List.of("ACTIVE","RESERVE","SCORED").contains(p.status())); }
        }
        for (var slot : state.goalSlots()) {
            assertThat(slot.status().equals("UNUSED")).isEqualTo(slot.slot()>=state.nextGoalSlot());
        }
        if (state.resolution()!=null && !state.resolution().challenged()) { assertThat(state.resolution().actualFace()).isNull(); }
    }
}
