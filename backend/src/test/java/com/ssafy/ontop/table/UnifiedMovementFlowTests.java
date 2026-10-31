package com.ssafy.ontop.table;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.profiles.active=local","ontop.websocket.authenticated=true",
    "ontop.world.movement.client-position=true","ontop.world.movement.tuned-profile=true",
    "ontop.world.movement.minimum-interval=1ns",
    "ontop.websocket.heartbeat.interval=100ms","ontop.websocket.heartbeat.timeout=1s",
    "ontop.world.channels[0].channel-id=one","ontop.world.channels[0].name=통합이동",
    "ontop.world.channels[0].capacity=4"})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class UnifiedMovementFlowTests {
    @LocalServerPort int port;
    @Autowired WorldChannelRegistry channels;
    @Test void 검증복구_따라가기_수동해제_무보고_단절복귀를_같은소켓계약으로_확인한다() throws Exception {
        long previousEpoch;
        try(var first=connect("naver");var second=connect("ssafy")){
            var initial=own(join(first),first.userId);join(second);previousEpoch=initial.path("motion").path("epoch").asLong();
            var bad=report(first,1,previousEpoch,70,.84,70,true,true);
            assertThat(bad.path("motion").path("authority").asText()).isEqualTo("CLIENT_VALIDATED");
            assertThat(bad.path("motion").path("correctionReason").asText()).isEqualTo("SPEED");
            assertThat(bad.path("position").path("x").asDouble()).isEqualTo(initial.path("position").path("x").asDouble());
            var resumed=report(first,2,bad.path("motion").path("epoch").asLong(),bad.path("position").path("x").asDouble()+.01,
                    bad.path("position").path("y").asDouble(),bad.path("position").path("z").asDouble(),false,true);
            assertThat(resumed.path("position").path("lastInputSeq").asLong()).isEqualTo(2);
            fixture(first,0,.84,36);fixture(second,8,.84,36);
            var started=first.request("WORLD_FOLLOW_START",Map.of("targetId",second.userId));
            assertThat(started.path("type").asText()).isEqualTo("WORLD_FOLLOW_STATE");
            var directed=first.await(m->m.path("type").asText().equals("WORLD_STATE")&&own(m.path("payload"),first.userId).path("motion").path("authority").isMissingNode());
            var follow=own(directed.path("payload"),first.userId);
            assertThat(follow.path("motion").path("authority").isMissingNode()).isTrue();
            assertThat(follow.path("motion").path("profile").asText()).isEqualTo("PARK_V1");
            var automatic=report(first,3,follow.path("motion").path("epoch").asLong(),.2,.84,36,true,false);
            assertThat(automatic.path("position").path("lastInputSeq").asLong()).isLessThan(3);
            assertThat(first.request("WORLD_FOLLOW_CHECK",Map.of()).at("/payload/links")).hasSize(1);
            var manual=first.request("WORLD_MOVE",Map.of("seq",4,"dx",-1,"dz",0,"run",false));
            assertThat(own(manual.path("payload"),first.userId).path("position").path("lastInputSeq").asLong()).isEqualTo(4);
            assertThat(first.request("WORLD_FOLLOW_CHECK",Map.of()).at("/payload/links")).isEmpty();
            first.await(m->m.path("type").asText().equals("WORLD_STATE")&&own(m.path("payload"),first.userId).at("/motion/authority").asText().equals("CLIENT_VALIDATED"));
            fixture(first,0,.84,36);fixture(second,8,.84,36);
            var again=first.request("WORLD_FOLLOW_START",Map.of("targetId",second.userId));
            String link=again.at("/payload/links/0/followId").asText();
            assertThat(first.request("WORLD_FOLLOW_STOP",Map.of("followId",link)).at("/payload/links")).isEmpty();
            first.request("WORLD_FOLLOW_START",Map.of("targetId",second.userId));
            second.stopPong();assertThat(second.awaitClose()).isEqualTo(1001);
            assertThat(first.request("WORLD_FOLLOW_CHECK",Map.of()).at("/payload/links")).isEmpty();
            var postFollow=first.await(m->m.path("type").asText().equals("WORLD_STATE")&&own(m.path("payload"),first.userId).at("/motion/authority").asText().equals("CLIENT_VALIDATED"));
            var post=own(postFollow.path("payload"),first.userId);
            report(first,5,post.at("/motion/epoch").asLong(),post.at("/position/x").asDouble(),post.at("/position/y").asDouble(),post.at("/position/z").asDouble(),false,false);
            var expiry=first.await(m->m.path("type").asText().equals("WORLD_STATE")&&own(m.path("payload"),first.userId).at("/motion/correctionReason").asText().equals("REPORT_EXPIRED"));
            var safe=own(expiry.path("payload"),first.userId);
            assertThat(safe.at("/motion/authority").asText()).isEqualTo("CLIENT_VALIDATED");
            var fresh=report(first,6,safe.at("/motion/epoch").asLong(),safe.at("/position/x").asDouble(),safe.at("/position/y").asDouble(),safe.at("/position/z").asDouble(),false,false);
            assertThat(fresh.at("/position/lastInputSeq").asLong()).isEqualTo(6);
            previousEpoch=fresh.at("/motion/epoch").asLong();
            first.stopPong();assertThat(first.awaitClose()).isEqualTo(1001);
        }
        try(var returned=connect("naver")){
            var fresh=own(join(returned),returned.userId);
            assertThat(fresh.at("/motion/authority").asText()).isEqualTo("CLIENT_VALIDATED");
            assertThat(fresh.at("/motion/epoch").asLong()).isNotEqualTo(previousEpoch);
            var stale=report(returned,999,previousEpoch,60,10,60,true,true);
            assertThat(stale.at("/position/lastInputSeq").asLong()).isZero();
            assertThat(stale.at("/position/x").asDouble()).isNotEqualTo(60);
            var active=report(returned,1,fresh.at("/motion/epoch").asLong(),fresh.at("/position/x").asDouble(),fresh.at("/position/y").asDouble(),fresh.at("/position/z").asDouble(),false,false);
            assertThat(active.at("/position/lastInputSeq").asLong()).isEqualTo(1);
        }
    }
    private ScenarioClient connect(String login) throws Exception {var c=new ScenarioClient(port,login);c.await(m->m.path("type").asText().equals("CONNECTED"));return c;}
    private JsonNode join(ScenarioClient c) throws Exception {c.request("CHANNEL_JOIN",Map.of("channelId","one"));return c.await(m->m.path("type").asText().equals("WORLD_STATE")).path("payload");}
    private JsonNode report(ScenarioClient c,long seq,long epoch,double x,double y,double z,boolean run,boolean manual) throws Exception {
        var reply=c.request("WORLD_POSITION",Map.of("seq",seq,"epoch",epoch,"x",x,"y",y,"z",z,"yaw",0,"run",run,"jump",false,"manual",manual));
        assertThat(reply.path("type").asText()).isEqualTo("WORLD_STATE");return own(reply.path("payload"),c.userId);
    }
    private void fixture(ScenarioClient c,double x,double y,double z) throws Exception {
        channels.releaseFacility(c.userId,new WorldFacilityService.Pose(x,y,z,0));
        c.await(m->m.path("type").asText().equals("WORLD_STATE")&&Math.abs(own(m.path("payload"),c.userId).at("/position/x").asDouble()-x)<.01
            &&own(m.path("payload"),c.userId).at("/motion/authority").asText().equals("CLIENT_VALIDATED"));
    }
    private JsonNode own(JsonNode state,String id){for(var a:state.path("avatars"))if(a.path("userId").asText().equals(id))return a;return com.fasterxml.jackson.databind.node.MissingNode.getInstance();}
}
