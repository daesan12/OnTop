package com.ssafy.ontop.ai;

import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AiPolicyTests {
    private final OfflineDecisions decisions = new OfflineDecisions();
    private AiDecisions.Chat chat(String id, String author, String text) {
        return new AiDecisions.Chat(id, "world:one", author, text, 100, 4, 4);
    }
    @Test void offlineModeIsExplicitAndQuotesAreNotAutomaticallyHidden() {
        var targets = List.of(chat("a", "a", "씨발"), chat("b", "b", "욕설 예시 씨발이라고 했어요"), chat("c", "a", "안녕하세요"));
        var result = decisions.moderate(targets, targets);
        assertThat(result.provider()).isEqualTo("OFFLINE_RULE_FIXTURE");
        assertThat(result.messages()).containsEntry("a", AiDecisions.Verdict.VIOLATION)
                .containsEntry("b", AiDecisions.Verdict.UNCERTAIN).containsEntry("c", AiDecisions.Verdict.NORMAL);
    }
    @Test void conflictNeedsMoreThanOneSpeakerAndDoesNotImplyMessageViolation() {
        var chats = List.of(chat("a", "a", "너 나가"), chat("b", "b", "왜 시비 걸어"));
        assertThat(decisions.moderate(chats, chats).conflict()).isTrue();
        assertThat(decisions.moderate(chats, chats).messages().values()).containsOnly(AiDecisions.Verdict.NORMAL);
        assertThat(decisions.moderate(List.of(chats.getFirst()), chats).conflict()).isFalse();
    }
    @Test void feedbackSeparatesUrgentOutageFromSuggestions() {
        assertThat(decisions.triage("전체 접속 불가").severity()).isZero();
        assertThat(decisions.triage("캐릭터가 안 움직여요").severity()).isEqualTo(1);
        assertThat(decisions.triage("의상을 더 추가해주세요").severity()).isEqualTo(3);
    }
    @Test void npcMovementStaysOnWalkwayAndCancelsStaleTalk() {
        var director = new NpcDirector();
        director.omok(true);
        for (int i=0;i<200;i++) {
            for (var npc : director.tick(i*250L, .25)) {
                assertThat(npc.x() >= 4 && npc.x() <= 28 && npc.z() >= 4 && npc.z() <= 18).isTrue();
                assertThat(Math.abs(npc.z()-4)<.01 || Math.abs(npc.z()-18)<.01 || Math.abs(npc.x()-4)<.01 || Math.abs(npc.x()-28)<.01).isTrue();
            }
        }
        var guide = director.views().getFirst();
        assertThat(guide.action()).isEqualTo("WATCH_OMOK");
        assertThat(guide.x()).isCloseTo(16, within(.01));
        long generation = director.beginTalk("guide", 60_000);
        director.cancelTalk("guide");
        director.finishTalk("guide", generation, new AiText.Reply("과거 응답", "FIXED"), 60_100);
        assertThat(director.views().getFirst().speech()).isNotEqualTo("과거 응답");
    }
    @Test void secondIncidentHasAnIndependentArrivalAnnouncement() {
        var director = new NpcDirector();
        director.incident(28,18,0);
        for(int i=0;i<100;i++) director.tick(i*100L,.1);
        long first=director.views().get(1).speechUntil();
        director.incident(4,18,10_000);
        for(int i=100;i<400;i++) director.tick(i*100L,.1);
        assertThat(director.views().get(1).speechUntil()).isGreaterThan(first);
    }
    @Test void incidentIdSuppressesDuplicateArrivalButNewEventAtSameLocationSpeaksAgain() {
        var director=new NpcDirector();
        director.incident("one",28,18,"갈등 주의",0);
        for(int i=0;i<30;i++) director.tick(i*100L,.1);
        assertThat(director.views().get(1).speech()).isEqualTo("갈등 주의");
        long first=director.views().get(1).speechUntil();
        director.incident("one",28,18,"중복",3_000);
        director.tick(3_100,.1);
        assertThat(director.views().get(1).speechUntil()).isEqualTo(first);
        director.incident("two",28,18,"모욕 주의",4_000);
        director.tick(4_100,.1);
        assertThat(director.views().get(1).speech()).isEqualTo("모욕 주의");
        assertThat(director.views().get(1).speechUntil()).isGreaterThan(first);
    }
    @Test void personaRolesAndGreetingsDoNotDependOnHardcodedNpcIds() {
        var persona=new NpcDirector.Persona("custom_police","순경 이","다른 순경","POLICE",0,
                List.of("첫 인사","다른 인사"),10,0,100,2);
        var director=new NpcDirector(List.of(persona));
        assertThat(director.greeting("custom_police")).isEqualTo("첫 인사");
        assertThat(director.greeting("custom_police")).isEqualTo("다른 인사");
        director.incident(4,4,0);
        assertThat(director.tick(100,.1).getFirst().action()).isEqualTo("RESPOND_TO_VIOLATION");
        assertThatThrownBy(() -> new NpcDirector(List.of(persona,persona))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void terminalCommentBypassesOrdinaryCooldownAndThenReturnsToPatrol() {
        var director=new NpcDirector(); director.omok(true);
        for(int i=0;i<80;i++) director.tick(i*250L,.25);
        director.comment("일반 대사","FIXED",20_000);
        assertThat(director.views().getFirst().speech()).isNotEqualTo("일반 대사");
        director.comment("종료 총평","SERVER_RESULT",20_000,true);
        assertThat(director.views().getFirst().speech()).isEqualTo("종료 총평");
        director.omok(false);
        assertThat(director.tick(32_000,.25).getFirst().action()).isEqualTo("PATROL");
    }
    @Test void unavailableSpeakerDoesNotConsumeCommentAndLatestFactsCanBeDeliveredAfterArrival() {
        var director=new NpcDirector(); director.omok(true);
        assertThat(director.comment("흑 우세","RAPFI",0)).isFalse();
        for(int i=0;i<200;i++) director.tick(i*250L,.25);
        assertThat(director.comment("흑 우세","RAPFI",50_000)).isTrue();
        assertThat(director.comment("중복 발화","RAPFI",50_001)).isFalse();
        assertThat(director.views().getFirst().speech()).isEqualTo("흑 우세");
    }
    @Test void aNewDestinationUsesTheShorterWalkwayDirectionWithoutCuttingGrass() {
        var director=new NpcDirector();
        director.incident(28,18,0);
        director.tick(0,.25);
        director.incident(16,18,100);
        for(int i=1;i<=24;i++) director.tick(100+i*250L,.25);
        var police=director.views().get(1);
        assertThat(police.x()).isCloseTo(16,within(.01));
        assertThat(police.z()).isCloseTo(18,within(.01));
    }
}
