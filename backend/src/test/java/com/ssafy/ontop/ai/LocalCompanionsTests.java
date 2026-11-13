package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LocalCompanionsTests {
    final ObjectMapper mapper=new ObjectMapper().findAndRegisterModules();final TableHub hub=mock(TableHub.class);final Time clock=new Time();
    final List<TableHub.AiTable> tables=new ArrayList<>();
    LocalCompanions create(OmokAnalyzer analyzer) {
        return create(analyzer,AiText.fixed());
    }
    LocalCompanions create(OmokAnalyzer analyzer,AiText texts) {
        when(hub.aiWaitingOmok()).thenAnswer(i -> List.copyOf(tables));
        when(hub.aiReserveOmok(any(),anyString())).thenAnswer(i -> tables.remove(i.getArgument(0)));
        when(hub.aiPracticeValid(anyString(),anyString(),anyString())).thenReturn(true);
        return new LocalCompanions(hub,mapper,clock,analyzer,texts,null);
    }
    void table(String id,String channel,String owner) { tables.add(new TableHub.AiTable(id,channel,owner,1,0,.8,0)); }
    @Test void sharedBoardViewIsOnlyExposedToAuthorizedTableObserversAndContainsTheLastMove() {
        table("t1","one","101");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable())) {
            var initial=mapper.valueToTree(ai.invite("101",LocalCompanions.Difficulty.EASY));
            String gameId=initial.path("snapshot").path("gameId").asText();
            verify(hub,atLeastOnce()).aiUpdatePracticeState(eq("t1"),anyString(),eq(gameId),eq(initial.path("snapshot").path("version").asLong()),eq(true));
            assertThat(ai.status("202","one").get("observedPractice")).isNull();
            when(hub.aiPracticeChatGame("202")).thenReturn(gameId);
            var observed=mapper.valueToTree(ai.status("202","one"));
            assertThat(observed.path("practice").isNull()).isTrue();
            assertThat(observed.path("observedPractice").path("snapshot").path("gameId").asText()).isEqualTo(gameId);
            var placed=mapper.valueToTree(ai.action("101",mapper.createObjectNode().put("gameId",gameId).put("version",initial.path("snapshot").path("version").asLong()).put("kind","place").put("actionId","shared-board-1").put("x",7).put("y",7)));
            assertThat(placed.path("lastMove").path("x").asInt()).isEqualTo(7);
            assertThat(placed.path("lastMove").path("stone").asText()).isEqualTo("BLACK");
            verify(hub,atLeastOnce()).aiUpdatePracticeState(eq("t1"),anyString(),eq(gameId),eq(placed.path("snapshot").path("version").asLong()),eq(true));
            when(hub.aiPracticeChatGame("202")).thenReturn("");
            assertThat(ai.status("202","one").get("observedPractice")).isNull();
        }
    }
    @Test void eachTableHasItsOwnOpponentEvenAtTheSameDifficulty() {
        table("t1","one","101");table("t2","one","202");table("t3","one","303");table("t4","one","404");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable())){
            var child=ai.invite("101",LocalCompanions.Difficulty.EASY);var neighbor=ai.invite("202",LocalCompanions.Difficulty.NORMAL);var elder=ai.invite("303",LocalCompanions.Difficulty.HARD);
            assertThat(child).containsEntry("name","강잼민");assertThat(neighbor).containsEntry("name","윤한수");assertThat(elder).containsEntry("name","박영감");
            assertThat(List.of(child.get("actorId"),neighbor.get("actorId"),elder.get("actorId"))).doesNotHaveDuplicates();
            var otherElder=ai.invite("404",LocalCompanions.Difficulty.HARD);
            assertThat(otherElder.get("actorId")).isNotEqualTo(elder.get("actorId"));
            assertThat(otherElder.get("npcUserId")).isNotEqualTo(elder.get("npcUserId"));
            assertThat(practice(ai,"303").path("snapshot").path("gameId").asText()).isNotEqualTo(practice(ai,"404").path("snapshot").path("gameId").asText());
            assertThat(ai.invite("404",LocalCompanions.Difficulty.HARD).get("actorId")).isEqualTo(otherElder.get("actorId"));
            verify(hub,times(4)).aiReserveOmok(any(),anyString());
        }
    }
    @Test void approachingResidentCannotPlayOrTimeoutUntilThePhysicalArrival() {
        var nav=mock(com.ssafy.ontop.world.movement.ParkNavigation.class);var area=new com.ssafy.ontop.world.movement.ParkNavigation.Area(-32,32,-24,64);
        when(nav.plazaTables()).thenReturn(area);when(nav.spawn(area)).thenReturn(new com.ssafy.ontop.world.movement.ParkNavigation.Point(0,.8,0));
        when(nav.groundPoint(anyDouble(),anyDouble())).thenAnswer(i->new com.ssafy.ontop.world.movement.ParkNavigation.Point(i.getArgument(0),.8,i.getArgument(1)));
        when(hub.aiActors()).thenReturn(Map.of("one",Map.of("101",new com.ssafy.ontop.world.movement.ParkNavigation.Point(10,.8,0))));
        when(hub.aiWaitingOmok()).thenAnswer(i->List.copyOf(tables));when(hub.aiReserveOmok(any(),anyString())).thenAnswer(i->tables.remove(i.getArgument(0)));when(hub.aiPracticeValid(anyString(),anyString(),anyString())).thenReturn(true);
        tables.add(new TableHub.AiTable("t1","one","101",1,10,.8,0));
        try(var ai=new LocalCompanions(hub,mapper,clock,(b,m)->OmokAnalyzer.unavailable(),AiText.fixed(),()->nav)){
            String id=ai.invite("101",LocalCompanions.Difficulty.EASY).get("actorId").toString();ai.tick();
            assertThat(practice(ai,"101").path("phase").asText()).isEqualTo("ARRIVING");assertThat(practice(ai,"101").path("snapshot").path("endedAt").isNull()).isTrue();
            assertThatThrownBy(()->ai.action("101",mapper.createObjectNode().put("gameId",practice(ai,"101").path("snapshot").path("gameId").asText()).put("kind","place"))).hasMessageContaining("걸어오고");
            var initial=mapper.valueToTree(ai.status("101","one").get("actors"));
            var body=java.util.stream.StreamSupport.stream(initial.spliterator(),false).filter(a->a.path("id").asText().equals(id)).findFirst().orElseThrow();
            assertThat(body.path("x").asDouble()).isEqualTo(12.4);assertThat(body.path("moving").asBoolean()).isTrue();
            assertThat(initial.size()).isEqualTo(4); // Three roamers plus one short entrance actor.
            clock.at=clock.at.plusMillis(900);ai.tick();
            assertThat(practice(ai,"101").path("phase").asText()).isEqualTo("ARRIVING");
            clock.at=clock.at.plusMillis(900);ai.tick();
            var p=practice(ai,"101");assertThat(p.path("phase").asText()).isEqualTo("PLAYING");assertThat(mapper.convertValue(p.path("snapshot").path("turnDeadline"),Instant.class)).isEqualTo(clock.instant().plusSeconds(30));
            assertThat(mapper.valueToTree(ai.status("101","one").get("actors")).findValuesAsText("id")).contains(id);
            ai.action("101",mapper.createObjectNode().put("gameId",p.path("snapshot").path("gameId").asText()).put("version",p.path("snapshot").path("version").asLong()).put("kind","forfeit"));ai.tick();
            assertThat(mapper.valueToTree(ai.status("101","one").get("actors")).findValuesAsText("id")).doesNotContain(id);
            assertThat(mapper.valueToTree(ai.status("101","one").get("actors")).size()).isEqualTo(3);
        }
    }
    com.fasterxml.jackson.databind.JsonNode practice(LocalCompanions ai,String owner) {return mapper.valueToTree(ai.status(owner,"one").get("practice"));}
    @Test void thirtySecondsAutoInviteAndBusyChannelDoesNotStopOtherTables() {
        table("t1","one","101");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable())) {
            ai.tick();clock.advance(29);ai.tick();assertThat(practice(ai,"101").isNull()).isTrue();
            clock.advance(1);ai.tick();assertThat(practice(ai,"101").path("bet").asInt()).isZero();
            table("t2","one","202");table("t3","two","505");ai.tick();clock.advance(30);ai.tick();
            assertThat(practice(ai,"202").path("npcUserId").asText()).isNotBlank();assertThat(practice(ai,"505").path("npcUserId").asText()).isNotBlank();
            assertThat(ai.status("202","one").get("waitSeconds")).isEqualTo(-1L);
        }
    }
    @Test void manySameDifficultyTablesKeepIndependentBodiesAndReleaseOnlyTheChangedSeat() {
        var nav=mock(com.ssafy.ontop.world.movement.ParkNavigation.class);
        var area=new com.ssafy.ontop.world.movement.ParkNavigation.Area(-32,32,-24,64);
        when(nav.plazaTables()).thenReturn(area);when(nav.spawn(area)).thenReturn(new com.ssafy.ontop.world.movement.ParkNavigation.Point(0,.8,0));
        when(nav.groundPoint(anyDouble(),anyDouble())).thenAnswer(i->new com.ssafy.ontop.world.movement.ParkNavigation.Point(i.getArgument(0),.8,i.getArgument(1)));
        when(hub.aiActors()).thenReturn(Map.of("one",Map.of("100",new com.ssafy.ontop.world.movement.ParkNavigation.Point(0,.8,0))));
        when(hub.aiWaitingOmok()).thenAnswer(i->List.copyOf(tables));when(hub.aiReserveOmok(any(),anyString())).thenAnswer(i->tables.remove(i.getArgument(0)));
        when(hub.aiPracticeValid(anyString(),anyString(),anyString())).thenReturn(true);
        try(var ai=new LocalCompanions(hub,mapper,clock,(b,m)->OmokAnalyzer.unavailable(),AiText.fixed(),()->nav)){
            var ids=new ArrayList<String>();
            for(int i=0;i<9;i++){table("t"+i,"one",Integer.toString(100+i));ids.add(ai.invite(Integer.toString(100+i),LocalCompanions.Difficulty.HARD).get("actorId").toString());}
            assertThat(ids).doesNotHaveDuplicates();clock.advance(2);ai.tick();
            var actors=mapper.valueToTree(ai.status("100","one").get("actors"));
            assertThat(actors.size()).isEqualTo(12);
            assertThat(java.util.stream.StreamSupport.stream(actors.spliterator(),false).filter(a->a.path("role").asText().equals("OPPONENT")).count()).isEqualTo(9);
            assertThat(java.util.stream.StreamSupport.stream(actors.spliterator(),false).filter(a->!a.path("role").asText().equals("OPPONENT")).map(a->a.path("action").asText()).toList()).doesNotContain("PLAY_OMOK","APPROACH_OMOK");
            when(hub.aiPracticeValid(eq("t0"),anyString(),anyString())).thenReturn(false);ai.tick();
            assertThat(practice(ai,"100").isNull()).isTrue();
            assertThat(practice(ai,"101").path("phase").asText()).isEqualTo("PLAYING");
            assertThat(mapper.valueToTree(ai.status("101","one").get("actors")).findValuesAsText("id")).doesNotContain(ids.getFirst()).containsAll(ids.subList(1,ids.size()));
        }
    }
    @Test void failedAutomaticReservationWaitsThirtySecondsBeforeRetryingAndManualInviteStillWorks() {
        table("t1","one","101");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable())) {
            when(hub.aiReserveOmok(any(),anyString())).thenReturn(false);
            ai.tick();clock.advance(30);ai.tick();
            verify(hub,times(1)).aiReserveOmok(any(),anyString());
            for(int i=0;i<5;i++){clock.at=clock.at.plusMillis(100);ai.tick();}
            verify(hub,times(1)).aiReserveOmok(any(),anyString());
            assertThat(ai.status("101","one").get("waitSeconds")).isEqualTo(30L);
            clock.at=clock.at.plusMillis(29_500);ai.tick();
            verify(hub,times(2)).aiReserveOmok(any(),anyString());
            when(hub.aiReserveOmok(any(),anyString())).thenAnswer(i->tables.remove(i.getArgument(0)));
            assertThat(ai.invite("101",LocalCompanions.Difficulty.EASY)).containsEntry("difficulty",LocalCompanions.Difficulty.EASY);
        }
    }
    @Test void ticksStatusAndInviteStopRequestsShareOneStateBoundary() throws Exception {
        table("t1","one","101");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable());var workers=Executors.newFixedThreadPool(3)) {
            doAnswer(i->{table("t1","one","101");return null;}).when(hub).aiReleaseOmok(eq("t1"),anyString());
            var start=new CountDownLatch(1);
            var requests=workers.submit(()->{start.await();for(int i=0;i<20;i++){
                var p=mapper.valueToTree(ai.invite("101",LocalCompanions.Difficulty.EASY));
                ai.action("101",mapper.createObjectNode().put("gameId",p.path("snapshot").path("gameId").asText()).put("kind","stop"));
            }return true;});
            var ticks=workers.submit(()->{start.await();for(int i=0;i<20;i++)ai.tick();return true;});
            var reads=workers.submit(()->{start.await();for(int i=0;i<20;i++)ai.status("101","one");return true;});
            start.countDown();assertThat(requests.get(5,TimeUnit.SECONDS)).isTrue();
            assertThat(ticks.get(5,TimeUnit.SECONDS)).isTrue();assertThat(reads.get(5,TimeUnit.SECONDS)).isTrue();
            assertThat(practice(ai,"101").isNull()).isTrue();
            verify(hub,times(20)).aiReleaseOmok(eq("t1"),anyString());
        }
    }
    @Test void manualInviteMovesAndRefusesUndoAndDrawWithoutChangingBoard() throws Exception {
        table("t1","one","101");
        try(var ai=create((b,m)->new OmokAnalyzer.Analysis("TEST","UNKNOWN",null,0,0,"8,7","판세를 지켜보세."))) {
            ai.invite("101",LocalCompanions.Difficulty.HARD);
            ai.action("101",mapper.createObjectNode().put("gameId",practice(ai,"101").path("snapshot").path("gameId").asText()).put("kind","place").put("x",7).put("y",7).put("version",0).put("actionId","human-one"));
            for(int n=0;n<100&&practice(ai,"101").path("thinking").asBoolean();n++)Thread.sleep(20);
            var p=practice(ai,"101");assertThat(p.path("snapshot").path("board").path("moveCount").asInt()).isEqualTo(2);
            assertThat(p.path("snapshot").path("turnUserId").asLong()).isEqualTo(101);
            long version=p.path("snapshot").path("version").asLong();
            for(String kind:List.of("undoRequest","drawRequest")) assertThat(ai.action("101",mapper.createObjectNode().put("gameId",practice(ai,"101").path("snapshot").path("gameId").asText()).put("kind",kind))).containsEntry("rejected",true);
            assertThat(practice(ai,"101").path("snapshot").path("version").asLong()).isEqualTo(version);
            assertThatThrownBy(()->ai.action("101",mapper.createObjectNode().put("gameId",practice(ai,"101").path("snapshot").path("gameId").asText()).put("kind","place").put("x",6).put("y",7).put("version",0).put("actionId","stale"))).isInstanceOf(IllegalArgumentException.class);
            assertThat(practice(ai,"202").isNull()).isTrue();
            ai.action("101",mapper.createObjectNode().put("gameId",practice(ai,"101").path("snapshot").path("gameId").asText()).put("kind","stop"));verify(hub).aiReleaseOmok(eq("t1"),anyString());
        }
    }
    @Test void departedOwnerReleasesLeaseAndDelayedEngineCannotApplyToNewGame() throws Exception {
        table("t1","one","101");var entered=new CountDownLatch(1);var resume=new CountDownLatch(1);
        try(var ai=create((b,m)->{entered.countDown();try{resume.await(2,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}return OmokAnalyzer.unavailable();})) {
            ai.invite("101",LocalCompanions.Difficulty.NORMAL);
            ai.action("101",mapper.createObjectNode().put("gameId",practice(ai,"101").path("snapshot").path("gameId").asText()).put("kind","place").put("x",7).put("y",7).put("version",0).put("actionId","one"));
            assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();
            when(hub.aiPracticeValid(anyString(),anyString(),anyString())).thenReturn(false);ai.tick();resume.countDown();
            assertThat(practice(ai,"101").isNull()).isTrue();verify(hub).aiReleaseOmok(eq("t1"),anyString());
        } finally {resume.countDown();}
    }
    @Test void settingsChangesResetAutomaticWaitAndTurnTimeoutRemainsAuthoritative() {
        table("t1","one","101");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable())) {
            ai.tick();clock.advance(29);tables.set(0,new TableHub.AiTable("t1","one","101",2,0,.8,0));ai.tick();clock.advance(1);ai.tick();
            assertThat(practice(ai,"101").isNull()).isTrue();ai.invite("101",LocalCompanions.Difficulty.EASY);clock.advance(31);ai.tick();
            assertThat(practice(ai,"101").path("snapshot").path("endReason").asText()).isEqualTo("TURN_TIMEOUT");
            assertThat(practice(ai,"101").path("speechSource").asText()).isEqualTo("FIXED_TIMEOUT");
            clock.advance(31);ai.tick();assertThat(practice(ai,"101").isNull()).isTrue();
        }
    }
    @Test void oldGameIdCannotStopOrMoveInANewPractice() {
        table("t1","one","101");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable())) {
            ai.invite("101",LocalCompanions.Difficulty.EASY);String old=practice(ai,"101").path("snapshot").path("gameId").asText();
            ai.action("101",mapper.createObjectNode().put("gameId",old).put("kind","stop"));table("t1","one","101");
            ai.invite("101",LocalCompanions.Difficulty.EASY);
            assertThatThrownBy(()->ai.action("101",mapper.createObjectNode().put("gameId",old).put("kind","stop"))).isInstanceOf(IllegalArgumentException.class);
            assertThat(practice(ai,"101").path("snapshot").path("gameId").asText()).isNotEqualTo(old);
        }
    }
    @Test void manualStopPausesThisSeatRevisionButReentryCanAutoInviteAgain() {
        table("t1","one","101");
        try(var ai=create((b,m)->OmokAnalyzer.unavailable())) {
            doAnswer(i->{tables.add(new TableHub.AiTable("t1","one","101",2,0,.8,0));return null;}).when(hub).aiReleaseOmok(eq("t1"),anyString());
            ai.invite("101",LocalCompanions.Difficulty.EASY);
            ai.action("101",mapper.createObjectNode().put("gameId",practice(ai,"101").path("snapshot").path("gameId").asText()).put("kind","stop"));
            ai.tick();clock.advance(31);ai.tick();assertThat(practice(ai,"101").isNull()).isTrue();
            tables.set(0,new TableHub.AiTable("t1","one","101",3,0,.8,0));ai.tick();clock.advance(30);ai.tick();
            assertThat(practice(ai,"101").isNull()).isFalse();
        }
    }
    @Test void delayedLlmCannotOverwriteForfeitOrKeepSpeechPending() throws Exception {
        table("t1","one","101");var entered=new CountDownLatch(1);var resume=new CountDownLatch(1);
        AiText slow=new AiText(){public String mode(){return "SPRING_AI";}public Reply generate(String p,String f,String fallback){entered.countDown();try{resume.await(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}return new Reply("늦은 옛 해설","TEST");}};
        try(var ai=create((b,m)->new OmokAnalyzer.Analysis("TEST","UNKNOWN",null,0,0,new String[]{"7,8","8,8","6,8"}[m.size()/2],"판세를 살펴보세."),slow)) {
            ai.invite("101",LocalCompanions.Difficulty.HARD);sixMoves(ai);assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();
            var s=practice(ai,"101").path("snapshot");
            ai.action("101",mapper.createObjectNode().put("gameId",s.path("gameId").asText()).put("version",s.path("version").asLong()).put("kind","forfeit"));
            assertThat(practice(ai,"101").path("speechPending").asBoolean()).isFalse();resume.countDown();Thread.sleep(30);
            assertThat(practice(ai,"101").path("speech").asText()).doesNotContain("늦은");
        } finally {resume.countDown();}
    }
    @Test void llmFailureFallsBackAndReleasesSpeechPending() throws Exception {
        table("t1","one","101");
        AiText failing=new AiText(){public String mode(){return "SPRING_AI";}public Reply generate(String p,String f,String fallback){throw new IllegalStateException("fixture failure");}};
        try(var ai=create((b,m)->new OmokAnalyzer.Analysis("TEST","UNKNOWN",null,0,0,new String[]{"7,8","8,8","6,8"}[m.size()/2],"판세를 살펴보세."),failing)) {
            ai.invite("101",LocalCompanions.Difficulty.HARD);sixMoves(ai);
            for(int n=0;n<100&&practice(ai,"101").path("speechPending").asBoolean();n++)Thread.sleep(20);
            assertThat(practice(ai,"101").path("speechPending").asBoolean()).isFalse();
            assertThat(practice(ai,"101").path("speechSource").asText()).isEqualTo("FIXED_PROVIDER_FAILURE");
        }
    }
    void sixMoves(LocalCompanions ai) throws Exception {
        for(int[] p:new int[][]{{7,7},{8,7},{6,7}}) {
            var s=practice(ai,"101").path("snapshot");
            ai.action("101",mapper.createObjectNode().put("gameId",s.path("gameId").asText()).put("version",s.path("version").asLong()).put("kind","place").put("actionId",UUID.randomUUID().toString()).put("x",p[0]).put("y",p[1]));
            for(int n=0;n<100&&practice(ai,"101").path("thinking").asBoolean();n++)Thread.sleep(20);
        }
    }
    @Test void recommendationsUseCurrentChannelFactsAndFaqSkipsLlm() throws Exception {
        table("t1","one","101");table("t2","two","202");
        var received=new java.util.concurrent.atomic.AtomicReference<String>();
        AiText probe=new AiText(){public String mode(){return "SPRING_AI";}public Reply generate(String p,String facts,String fallback){received.set(facts);return new Reply("조회한 사실로 답하네.","TEST");}};
        try(var ai=create((b,m)->OmokAnalyzer.unavailable(),probe)) {
            when(hub.aiActors()).thenReturn(Map.of("one",Map.of("101",new com.ssafy.ontop.world.movement.ParkNavigation.Point(0,.8,0)),"two",Map.of("202",new com.ssafy.ontop.world.movement.ParkNavigation.Point(0,.8,0))));
            ai.talk("101","guide","심심한데 뭐 할까요?");
            assertThat(ai.status("101","one").get("reply").toString()).contains("1개");assertThat(received.get()).isNull();
            clock.advance(11);ai.talk("101","omok","처음 두는 사람에게 짧게 조언해 주세요.");
            for(int n=0;n<100&&received.get()==null;n++)Thread.sleep(20);
            assertThat(received.get()).contains("1개").doesNotContain("2개");
        }
    }
    static class Time extends Clock {
        Instant at=Instant.parse("2026-11-09T00:00:00Z");void advance(long seconds){at=at.plusSeconds(seconds);}
        public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return at;}
    }
}
