package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.movement.ParkNavigation;
import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class LocalWorldAiPositionTests {
    @TempDir Path directory;
    @Test void missingCoordinatesStillProduceRuleAndSemanticReviewAndMattermostOutbox() throws Exception {
        var mapper=new ObjectMapper();var hub=mock(TableHub.class);var provider=spy(new OfflineDecisions());
        var sent=new java.util.concurrent.CopyOnWriteArrayList<String>();
        AiNotifier notifier=(id,kind,text)->{sent.add(text);return "TEST_MM";};
        try(var ai=new LocalWorldAi(mapper,directory,provider,notifier,hub,null,true)) {
            ai.chat(missing("rule","씨발"));ai.chat(missing("semantic","아 ㅈ같네"));ai.flush();ai.step();
            verify(provider,atLeastOnce()).assessConflict(anyList(),argThat(list->list.stream()
                    .anyMatch(c->c.id().equals("semantic")&&c.positionMissing())),anyLong());
            assertThat(sent).hasSize(2).anyMatch(t->t.contains("닉네임: 씨발"))
                    .anyMatch(t->t.contains("닉네임: 아 ㅈ같네"));
            verify(hub,never()).publishAi(anyString(),anyList(),eq("WORLD_AI_POLICE"),any(),anyString());
        }
        try(var store=new LocalAiStore(directory,mapper)) {
            assertThat(store.read().messages).hasSize(2).allMatch(m->m.processed()&&!m.hidden()&&m.chat().positionMissing());
            assertThat(store.read().notices).hasSize(2).allMatch(n->n.status().equals("SENT"));
        }
    }
    @Test void physicalPoliceRequestSurvivesEmptyWorldUntilLivePositionAppears() throws Exception {
        var hub=mock(TableHub.class);var positions=new AtomicReference<Map<String,Map<String,Point>>>(Map.of());
        var missingTicks=new CountDownLatch(2);
        var arrived=new CountDownLatch(1);
        doAnswer(call->{if("WORLD_AI_POLICE".equals(call.getArgument(2)))arrived.countDown();return null;})
                .when(hub).publishAi(anyString(),anyList(),anyString(),any(),anyString());
        when(hub.aiActors()).thenAnswer(call->{if(positions.get().isEmpty())missingTicks.countDown();return positions.get();});
        var navigation=mock(ParkNavigation.class);
        when(navigation.spawn()).thenReturn(new Point(0,.8,0));
        when(navigation.wholePark()).thenReturn(new ParkNavigation.Area(-90,90,-90,90));
        when(navigation.groundPoint(anyDouble(),anyDouble())).thenAnswer(call->new Point(call.getArgument(0),.8,call.getArgument(1)));
        when(navigation.policeApproach(any(Point.class))).thenAnswer(call -> call.getArgument(0));
        when(navigation.lineClear(any(),any())).thenReturn(true);
        try(var ai=new LocalWorldAi(new ObjectMapper(),directory,new OfflineDecisions(),AiNotifier.local(),hub,()->navigation,true)) {
            ai.chat(missing("rule","씨발"));ai.step();
            assertThat(missingTicks.await(2,TimeUnit.SECONDS)).isTrue();
            verify(hub,never()).publishAi(anyString(),anyList(),eq("WORLD_AI_POLICE"),any(),anyString());
            positions.set(Map.of("one",Map.of("101",new Point(2,.8,0))));
            assertThat(arrived.await(2,TimeUnit.SECONDS)).isTrue();
            verify(hub).publishAi(eq("one"),eq(List.of("101")),eq("WORLD_AI_POLICE"),
                    argThat(payload->payload instanceof Map<?,?> p && p.get("x").equals(0.0)),eq(""));
        }
    }
    @Test void fixtureArrivalAlsoUsesCurrentPositionInsteadOfStoredChatCoordinates() throws Exception {
        var hub=mock(TableHub.class);
        when(hub.aiActors()).thenReturn(Map.of("one",Map.of("101",new Point(12,4,7))));
        try(var ai=new LocalWorldAi(new ObjectMapper(),directory,new OfflineDecisions(),AiNotifier.local(),hub,null,true)) {
            ai.chat(missing("rule","씨발"));ai.step();
            verify(hub).publishAi(eq("one"),eq(List.of("101")),eq("WORLD_AI_POLICE"),
                    argThat(payload->payload instanceof Map<?,?> p && p.get("x").equals(12.0)&&p.get("z").equals(7.0)),eq(""));
        }
    }
    private WorldAiBridge.Chat missing(String id,String text) {
        return new WorldAiBridge.Chat(id,"one","101","닉네임",text,System.currentTimeMillis(),0,0,0,List.of("101"),"",true);
    }
}
