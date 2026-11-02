package com.ssafy.ontop.game.onecard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.onecard.domain.OneCard;
import com.ssafy.ontop.game.onecard.domain.OneCardMatch;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static com.ssafy.ontop.game.onecard.OneCardRulesTests.card;

class OneCardMatchTests {
    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 제출권한_필드조작과_버전을검사하고_전략적뽑기후바로넘긴다() {
        var match = match(List.of(101L,202L),Map.of(101L,List.of("hearts-5")));
        reject(Rejection.NOT_YOUR_TURN, () -> act(match,202,"wrong",Map.of("kind","draw"),START));
        reject(Rejection.INVALID_ACTION, () -> act(match,101,"stolen",Map.of("kind","play","cardId",match.hand(202).getFirst().id()),START));
        reject(Rejection.INVALID_ACTION, () -> act(match,101,"extra",Map.of("kind","draw","score",9999),START));
        var result = act(match,101,"draw",Map.of("kind","draw"),START);
        assertThat(match.hand(101)).hasSize(8);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
        assertThat(match.apply(new GameActionCommand(101,"one","draw",0,MAPPER.valueToTree(Map.of("kind","draw"))),START)).isEqualTo(result);
        reject(Rejection.ACTION_ID_CONFLICT, () -> match.apply(new GameActionCommand(101,"one","draw",0,MAPPER.valueToTree(Map.of("kind","play","cardId","hearts-5"))),START));
    }

    @Test
    void 공격누적과_마지막2와같은무늬3만_전체방어한다() {
        var match = match(List.of(101L,202L),Map.of(101L,List.of("hearts-2","spades-3","clubs-3"),202L,List.of("spades-2")));
        play(match,101,"hearts-2",START);
        play(match,202,"spades-2",START);
        assertThat(match.snapshot().attackTotal()).isEqualTo(4);
        reject(Rejection.INVALID_ACTION, () -> play(match,101,"clubs-3",START));
        play(match,101,"spades-3",START);
        assertThat(match.snapshot().attackTotal()).isZero();
        assertThat(match.hand(101)).hasSize(5);
        act(match,202,"draw",Map.of("kind","draw"),START);
    }

    @Test
    void 공격을수락하면_누적장수를받고_공격을지운다() {
        var match = match(List.of(101L,202L),Map.of(101L,List.of("hearts-A"),202L,List.of("joker-black")));
        play(match,101,"hearts-A",START);
        play(match,202,"joker-black",START);
        assertThat(match.snapshot().stage()).isEqualTo("CHOOSE_SUIT");
        assertThat(match.snapshot().attackTotal()).isEqualTo(8);
        act(match,202,"suit",Map.of("kind","select-suit","suit","spades"),START);
        reject(Rejection.INVALID_ACTION, () -> act(match,101,"ordinary",Map.of("kind","draw"),START));
        act(match,101,"accept",Map.of("kind","accept-attack"),START);
        assertThat(match.hand(101)).hasSize(14);
        assertThat(match.snapshot().attackTotal()).isZero();
        assertThat(match.snapshot().lastAttack()).isNull();
    }

    @Test
    void K는시간연장없이추가행동_J는2인에서본인차례이고_Q는상대에게넘긴다() {
        var match = match(List.of(101L,202L),Map.of(101L,List.of("hearts-K","spades-K","spades-J","spades-Q")));
        play(match,101,"hearts-K",START.plusSeconds(10));
        play(match,101,"spades-K",START.plusSeconds(20));
        assertThat(match.snapshot().extraAction()).isTrue();
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(30));
        play(match,101,"spades-J",START.plusSeconds(25));
        assertThat(match.snapshot().turnUserId()).isEqualTo(101);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(55));
        play(match,101,"spades-Q",START.plusSeconds(26));
        assertThat(match.snapshot().direction()).isEqualTo(-1);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(56));
    }

    @Test
    void 기권후_둘만_남아도_Q는_방향만_반전하고_다른_생존자에게_넘긴다() {
        var match = match(List.of(101L,202L,303L),Map.of(101L,List.of("hearts-Q")));
        match.forfeit(303,START.plusSeconds(1));

        play(match,101,"hearts-Q",START.plusSeconds(2));

        assertThat(match.snapshot().direction()).isEqualTo(-1);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(32));
    }

    @Test
    void 네명일때Q방향전환과J한명건너뜀을적용한다() {
        var match = match(List.of(101L,202L,303L,404L),Map.of(101L,List.of("hearts-Q"),404L,List.of("hearts-J")));
        play(match,101,"hearts-Q",START);
        assertThat(match.snapshot().turnUserId()).isEqualTo(404);
        play(match,404,"hearts-J",START);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
    }

    @Test
    void 무늬선택은원래30초안에서만_진행하고만료하면자동선택후넘긴다() {
        var match = match(List.of(101L,202L),Map.of(101L,List.of("hearts-7","clubs-2","clubs-3","clubs-5","clubs-6")));
        play(match,101,"hearts-7",START.plusSeconds(20));
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(30));
        reject(Rejection.NOT_YOUR_TURN, () -> act(match,202,"suit",Map.of("kind","select-suit","suit","spades"),START.plusSeconds(25)));
        match.expire(START.plusSeconds(30));
        assertThat(match.snapshot().activeSuit()).isEqualTo("clubs");
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
        assertThat(match.hand(101)).hasSize(6);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(60));
    }

    @Test
    void 원카드선언_신고선착순과_3초경계_마지막특수카드즉시승리를검증한다() {
        var declared = oneLeft();
        act(declared,101,"declare",Map.of("kind","declare-one"),START.plusSeconds(1));
        reject(Rejection.INVALID_ACTION, () -> act(declared,202,"report",Map.of("kind","catch-one","targetUserId","101"),START.plusSeconds(2)));
        play(declared,101,"clubs-7",START.plusSeconds(2));
        assertThat(declared.snapshot().stage()).isEqualTo("FINISHED");
        assertThat(declared.snapshot().winnerUserIds()).containsExactly(101L);
        assertThat(declared.snapshot().turnDeadline()).isNull();
        var caught = oneLeft();
        act(caught,202,"report",Map.of("kind","catch-one","targetUserId","101"),START.plusSeconds(1));
        assertThat(caught.hand(101)).hasSize(3);
        reject(Rejection.INVALID_ACTION, () -> act(caught,101,"declare",Map.of("kind","declare-one"),START.plusSeconds(2)));
        var expired = oneLeft();
        reject(Rejection.INVALID_ACTION, () -> act(expired,202,"late",Map.of("kind","catch-one","targetUserId","101"),START.plusSeconds(3)));
        assertThat(expired.hand(101)).hasSize(1);
        assertThat(expired.snapshot().publicPlayers().getFirst().oneCardStatus()).isEqualTo("expired");
    }

    @Test
    void 덱부족은가능한만큼받고_한바퀴교착이면최소손패승리다() {
        var match = match(List.of(101L,202L),Map.of());
        for (int index = 0; index < 39; index++) {
            act(match,match.snapshot().turnUserId(),"d"+index,Map.of("kind","draw"),START);
        }
        assertThat(match.snapshot().drawCount()).isZero();
        assertThat(match.hand(101).size()+match.hand(202).size()).isEqualTo(53);
        act(match,match.snapshot().turnUserId(),"blocked1",Map.of("kind","draw"),START);
        act(match,match.snapshot().turnUserId(),"blocked2",Map.of("kind","draw"),START);
        assertThat(match.snapshot().endReason()).isEqualTo("STALEMATE");
        assertThat(match.snapshot().winnerUserIds()).containsExactly(202L);
    }

    @Test
    void 최초바닥을고른뒤_남은덱을섞어_특수카드가앞에몰리지않는다() {
        var reserved=List.of(card("hearts-2"),card("hearts-4"),card("clubs-5"));
        var remaining=OneCard.deck().stream().filter(value -> !reserved.contains(value))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        List<OneCard> deck=new ArrayList<>(remaining.subList(0,14));
        remaining.subList(0,14).clear();
        deck.addAll(reserved); deck.addAll(remaining);
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        var match=new OneCardMatch("one","table",List.of(101L,202L),deck,0,START,cards -> {
            calls.incrementAndGet(); java.util.Collections.swap(cards,0,1);
        },com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy.RECYCLE);
        assertThat(calls).hasValue(1);
        assertThat(match.snapshot().topCard()).isEqualTo(card("hearts-4"));
        act(match,101,"draw",Map.of("kind","draw"),START);
        assertThat(match.hand(101).getLast()).isEqualTo(card("clubs-5"));
    }

    @Test
    void 숫자카드가전부손패에있으면_바닥선정루프없이명시적으로실패한다() {
        List<OneCard> deck=new ArrayList<>();
        deck.addAll(OneCard.deck().stream().filter(OneCard::initial).toList());
        deck.addAll(OneCard.deck().stream().filter(value -> !value.initial()).toList());
        assertThatIllegalArgumentException().isThrownBy(() -> new OneCardMatch("one","table",List.of(101L,202L,303L,404L),
                deck,0,START,cards -> {},com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy.REMOVE));
    }

    @Test
    void 소진시_맨위바닥만남기고재활용하며_동점최소손패는공동승리다() {
        var recycle=match(List.of(101L,202L),Map.of(101L,List.of("hearts-5"),202L,List.of("hearts-6")));
        play(recycle,101,"hearts-5",START); play(recycle,202,"hearts-6",START);
        for (int index=0;index<39;index++) { act(recycle,recycle.snapshot().turnUserId(),"d"+index,Map.of("kind","draw"),START); }
        assertThat(recycle.snapshot().drawCount()).isZero();
        long actor=recycle.snapshot().turnUserId();
        act(recycle,actor,"recycle",Map.of("kind","draw"),START);
        assertThat(recycle.snapshot().topCard()).isEqualTo(card("hearts-6"));
        assertThat(recycle.hand(actor).getLast()).isEqualTo(card("hearts-4"));
        assertThat(recycle.snapshot().drawCount()).isEqualTo(1);
        var tied=match(List.of(101L,202L,303L,404L),Map.of());
        for (int index=0;index<25;index++) { act(tied,tied.snapshot().turnUserId(),"d"+index,Map.of("kind","draw"),START); }
        for (int index=0;index<4;index++) { act(tied,tied.snapshot().turnUserId(),"blocked"+index,Map.of("kind","draw"),START); }
        assertThat(tied.snapshot().winnerUserIds()).containsExactly(202L,303L,404L);
    }

    @Test
    void 기권은현재차례만넘기고_한명남으면종료한다() {
        var match = match(List.of(101L,202L,303L),Map.of());
        match.forfeit(202,START.plusSeconds(5));
        assertThat(match.snapshot().turnUserId()).isEqualTo(101);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(30));
        assertThat(match.hand(202)).isEmpty();
        match.forfeit(101,START.plusSeconds(6));
        assertThat(match.snapshot().winnerUserIds()).containsExactly(303L);
        long version = match.snapshot().version();
        match.forfeit(101,START.plusSeconds(7));
        assertThat(match.snapshot().version()).isEqualTo(version);
    }

    @Test
    void 기권손패정책은_서버가명시한REMOVE와RECYCLE만적용한다() {
        var players=List.of(101L,202L,303L);
        var deck=orderedDeck(players,Map.of());
        for (var policy : com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy.values()) {
            var match=new OneCardMatch("one","table",players,deck,0,START,cards -> {},policy);
            int before=match.snapshot().drawCount();
            match.forfeit(202,START);
            assertThat(match.hand(202)).isEmpty();
            assertThat(match.snapshot().drawCount()).isEqualTo(before+(policy.name().equals("RECYCLE") ? 7 : 0));
        }
    }

    @Test
    void 일반과공격시간초과는_규칙상카드를받고차례를넘기며시간패하지않는다() {
        var match = match(List.of(101L,202L),Map.of(101L,List.of("hearts-A")));
        play(match,101,"hearts-A",START.plusSeconds(10));
        match.expire(START.plusSeconds(40));
        assertThat(match.hand(202)).hasSize(10);
        assertThat(match.snapshot().turnUserId()).isEqualTo(101);
        assertThat(match.snapshot().stage()).isEqualTo("PLAYING");
        match.expire(START.plusSeconds(70));
        assertThat(match.hand(101)).hasSize(7);
        assertThat(match.snapshot().turnUserId()).isEqualTo(202);
    }

    private OneCardMatch oneLeft() {
        var match = match(List.of(101L,202L),Map.of(101L,List.of("hearts-K","spades-K","diamonds-K","clubs-K","clubs-J","clubs-Q","clubs-7")));
        for (String id : List.of("hearts-K","spades-K","diamonds-K","clubs-K","clubs-J","clubs-Q")) { play(match,101,id,START); }
        act(match,202,"return-turn",Map.of("kind","draw"),START);
        assertThat(match.hand(101)).hasSize(1);
        return match;
    }
    static OneCardMatch match(List<Long> players,Map<Long,List<String>> wanted) {
        return new OneCardMatch("one","table",players,orderedDeck(players,wanted),0,START,cards -> {},
                com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy.RECYCLE);
    }
    static List<OneCard> orderedDeck(List<Long> players,Map<Long,List<String>> wanted) {
        Set<String> reserved = new HashSet<>();
        wanted.values().forEach(reserved::addAll);
        reserved.add("hearts-4");
        List<OneCard> remaining = OneCard.deck().stream().filter(value -> !reserved.contains(value.id())).collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        List<OneCard> result = new ArrayList<>();
        for (long user : players) {
            List<OneCard> hand = new ArrayList<>(wanted.getOrDefault(user,List.of()).stream().map(OneCardRulesTests::card).toList());
            while (hand.size() < 7) { hand.add(remaining.removeFirst()); }
            result.addAll(hand);
        }
        result.add(card("hearts-4")); result.addAll(remaining);
        return result;
    }
    private static com.ssafy.ontop.game.action.GameActionResult act(OneCardMatch match,long user,String id,Map<String,Object> input,Instant now) {
        // expire와경합하는입력은서버최신버전기준으로시도한다.
        match.expire(now);
        return match.apply(new GameActionCommand(user,"one",id,match.snapshot().version(),MAPPER.valueToTree(input)),now);
    }
    private static void play(OneCardMatch match,long user,String card,Instant now) { act(match,user,card,Map.of("kind","play","cardId",card),now); }
    private static void reject(Rejection reason,org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(Rejected.class,error -> assertThat(error.reason()).isEqualTo(reason));
    }
}
