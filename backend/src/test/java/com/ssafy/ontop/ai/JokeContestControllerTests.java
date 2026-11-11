package com.ssafy.ontop.ai;

import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class JokeContestControllerTests {
    final DefaultListableBeanFactory beans=new DefaultListableBeanFactory();
    final LocalJokeContest contest=mock(LocalJokeContest.class);
    final WorldChannelRegistry channels=mock(WorldChannelRegistry.class);
    final TableHub hub=mock(TableHub.class);
    org.springframework.test.web.servlet.MockMvc mvc(boolean enabled){
        if(enabled){beans.registerSingleton("contest",contest);when(contest.featureKey()).thenReturn("jokeContest");}
        beans.registerSingleton("channels",channels);beans.registerSingleton("hub",hub);
        beans.registerSingleton("location",new JokeJudgeLocation(10,.8,20));
        return MockMvcBuilders.standaloneSetup(new AiFeaturesController(beans.getBeanProvider(AiFeature.class)),new JokeContestController(
            beans.getBeanProvider(LocalJokeContest.class),beans.getBeanProvider(WorldChannelRegistry.class),beans.getBeanProvider(JokeJudgeLocation.class),beans.getBeanProvider(TableHub.class))).build();
    }
    @Test void readsRequireAuthenticationAndUsePrincipalOwnership()throws Exception{
        var mvc=mvc(true);mvc.perform(get("/api/v1/ai/joke-contest/me")).andExpect(status().isUnauthorized());
        when(contest.mine("101")).thenReturn(java.util.Map.of("remaining",3));
        mvc.perform(get("/api/v1/ai/joke-contest/me").principal(()->"101")).andExpect(status().isOk()).andExpect(jsonPath("$.remaining").value(3)).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(get("/api/v1/ai/features").principal(()->"101")).andExpect(jsonPath("$.jokeContest").value(true));
        mvc.perform(get("/api/v1/ai/joke-contest/submissions/other").principal(()->"101")).andExpect(status().isOk());verify(contest).own("101","other");
    }
    @Test void submissionCannotBypassPresenceOrInjectIdentity()throws Exception{
        var mvc=mvc(true);
        mvc.perform(post("/api/v1/ai/joke-contest/submissions").principal(()->"101").contentType("application/json").content("{\"question\":\"왕이 넘어지면?\",\"answer\":\"킹콩\",\"userId\":\"202\",\"nickname\":\"가짜\"}"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("JOKE_OUT_OF_RANGE"));verify(contest,never()).submit(any(),any(),any(),any(),any(),anyBoolean());
        when(channels.channelOf("101")).thenReturn("one");when(channels.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(0,50,.8,20,0));
        mvc.perform(post("/api/v1/ai/joke-contest/submissions").principal(()->"101").contentType("application/json").content("{}" )).andExpect(status().isForbidden());
    }
    @Test void disabledFeatureAndInvalidDateReturnControlledErrors()throws Exception{
        var mvc=mvc(false);mvc.perform(get("/api/v1/ai/joke-contest/me").principal(()->"101")).andExpect(status().isServiceUnavailable());
    }
    @Test void nearbySubmissionUsesServerNicknameAndRejectsClientIdentity()throws Exception{
        var mvc=mvc(true);when(channels.channelOf("101")).thenReturn("one");
        when(channels.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(0,10,.8,20,0));
        when(hub.aiActors()).thenReturn(java.util.Map.of("one",java.util.Map.of("101",new com.ssafy.ontop.world.movement.ParkNavigation.Point(10,.8,20))));
        var state=mock(WorldChannelRegistry.WorldState.class);var avatar=mock(WorldChannelRegistry.Avatar.class);
        when(avatar.userId()).thenReturn("101");when(avatar.nickname()).thenReturn("진짜닉네임");
        when(state.avatars()).thenReturn(java.util.List.of(avatar));when(channels.worldState("one")).thenReturn(state);
        mvc.perform(post("/api/v1/ai/joke-contest/submissions").principal(()->"101").contentType("application/json")
            .content("{\"question\":\"왕이 넘어지면?\",\"answer\":\"킹콩\",\"idempotencyKey\":\"request123\",\"consent\":true,\"userId\":\"202\",\"nickname\":\"가짜\"}"))
            .andExpect(status().isOk());
        verify(contest).submit("101","진짜닉네임","왕이 넘어지면?","킹콩","request123",true);
        when(contest.rankings("invalid")).thenThrow(new java.time.format.DateTimeParseException("날짜 확인","invalid",0));
        mvc.perform(get("/api/v1/ai/joke-contest/rankings?date=invalid").principal(()->"101")).andExpect(status().isBadRequest());
    }
}
