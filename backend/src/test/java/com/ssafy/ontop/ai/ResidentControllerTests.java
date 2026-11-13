package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ResidentControllerTests {
    final DefaultListableBeanFactory beans=new DefaultListableBeanFactory();
    final LocalCompanions companions=mock(LocalCompanions.class);
    final WorldChannelRegistry channels=mock(WorldChannelRegistry.class);
    MockMvc mvc(boolean enabled){
        beans.registerSingleton("channels",channels);
        if(enabled){when(companions.featureKey()).thenReturn("companions");beans.registerSingleton("residents",companions);}
        return MockMvcBuilders.standaloneSetup(new AiFeaturesController(beans.getBeanProvider(AiFeature.class)),
                new ResidentController(beans.getBeanProvider(LocalCompanions.class),beans.getBeanProvider(WorldChannelRegistry.class))).build();
    }
    @Test void capabilitiesAreAuthenticatedAndReflectInitializedFeature()throws Exception{
        var mvc=mvc(true);
        mvc.perform(get("/api/v1/ai/features")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/ai/features").principal(()->"101")).andExpect(status().isOk())
                .andExpect(jsonPath("$.companions").value(true)).andExpect(jsonPath("$.jokeContest").value(false))
                .andExpect(header().string("Cache-Control","no-store"));
    }
    @Test void callerIdentityAndActualChannelAreUsedInsteadOfBodyOwner()throws Exception{
        var mvc=mvc(true);when(channels.channelOf("101")).thenReturn("one");
        when(companions.invite("101",LocalCompanions.Difficulty.HARD)).thenReturn(Map.of("accepted",true));
        mvc.perform(post("/api/v1/ai/companions/invite").principal(()->"101").contentType("application/json")
                .content("{\"difficulty\":\"HARD\",\"owner\":\"202\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accepted").value(true));
        verify(companions).invite("101",LocalCompanions.Difficulty.HARD);
        mvc.perform(post("/api/v1/ai/companions/invite").principal(()->"101").contentType("application/json").content("{\"difficulty\":\"INVALID\"}"))
                .andExpect(status().isBadRequest());
    }
    @Test void disconnectedAndDisabledCallsCannotStartResidents()throws Exception{
        var mvc=mvc(false);
        mvc.perform(get("/api/v1/ai/features").principal(()->"101")).andExpect(jsonPath("$.companions").value(false));
        mvc.perform(get("/api/v1/ai/companions/status").principal(()->"101")).andExpect(status().isConflict());
        when(channels.channelOf("101")).thenReturn("one");
        mvc.perform(get("/api/v1/ai/companions/status").principal(()->"101")).andExpect(status().isServiceUnavailable());
        mvc.perform(post("/api/v1/ai/companions/action").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        verifyNoInteractions(companions);
    }
    @Test void statusAndActionsStayBoundToTheAuthenticatedOwner()throws Exception{
        var mvc=mvc(true);when(channels.channelOf("101")).thenReturn("one");
        when(companions.status("101","one")).thenReturn(Map.of("practice",Map.of("name","박영감")));
        mvc.perform(get("/api/v1/ai/companions/status").principal(()->"101")).andExpect(jsonPath("$.practice.name").value("박영감"));
        mvc.perform(post("/api/v1/ai/companions/action").principal(()->"101").contentType("application/json").content("{\"kind\":\"forfeit\",\"owner\":\"202\"}"))
                .andExpect(status().isOk());
        verify(companions).action(eq("101"),argThat(body->body.path("kind").asText().equals("forfeit")));
    }
    @Test void missingPersonaIsAnInputErrorInsteadOfServerError()throws Exception{
        var mvc=mvc(true);when(channels.channelOf("101")).thenReturn("one");
        mvc.perform(post("/api/v1/ai/companions/talk").principal(()->"101").contentType("application/json").content("{\"question\":\"안녕하세요\"}"))
                .andExpect(status().isBadRequest());
        verify(companions,never()).talk(anyString(),any(),any());
    }
    @Test void companionPostsRequireJsonInsteadOfTheBrowsersDefaultPlainText()throws Exception{
        var mvc=mvc(true);when(channels.channelOf("101")).thenReturn("one");
        for(String endpoint:new String[]{"invite","action"}){
            String body=endpoint.equals("invite")?"{\"difficulty\":\"HARD\"}":"{\"kind\":\"place\",\"gameId\":\"npc-media\",\"version\":0,\"x\":7,\"y\":7}";
            mvc.perform(post("/api/v1/ai/companions/"+endpoint).principal(()->"101")
                    .contentType("text/plain;charset=UTF-8").content(body)).andExpect(status().isUnsupportedMediaType());
            mvc.perform(post("/api/v1/ai/companions/"+endpoint).principal(()->"101")
                    .contentType("application/json").content(body)).andExpect(status().isOk());
        }
        verify(companions,times(1)).invite("101",LocalCompanions.Difficulty.HARD);
        verify(companions,times(1)).action(eq("101"),argThat(body->body.path("kind").asText().equals("place")));
    }
}
