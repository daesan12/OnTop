package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.service.AlkkagiSpectatorPolicy;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AlkkagiSpectatorPolicyTests {
    final ObjectMapper mapper = new ObjectMapper();
    ObjectNode state() throws Exception {
        return (ObjectNode) mapper.readTree("{\"version\":3,\"turnNumber\":1,\"turn\":0,\"stage\":\"AIMING\",\"settings\":{\"halfWidth\":4.5,\"halfHeight\":5},\"pieces\":[{\"id\":\"p0\",\"owner\":0,\"alive\":true},{\"id\":\"p16\",\"owner\":1,\"alive\":true}]}");
    }
    ObjectNode cursor() { return mapper.createObjectNode().put("gameId","g").put("eventId",UUID.randomUUID().toString()).put("basedOnVersion",3).put("kind","CURSOR").put("x",1).put("y",2); }
    ObjectNode advice() { return cursor().put("kind","ADVICE").put("pieceId","p0").put("dx",.6).put("dy",.8).put("power",.5).without(java.util.List.of("x","y")); }
    @Test void 훈수는_공개상태를_변경하지않고_동일요청은_방송하지않는다() throws Exception {
        var policy=new AlkkagiSpectatorPolicy(); var state=state(); var copy=state.deepCopy(); var input=advice();
        assertThat(policy.accept("505",input,state,1000).fresh()).isTrue();
        assertThat(policy.accept("505",input,state,1100).fresh()).isFalse();
        assertThat(state).isEqualTo(copy);
        assertThatThrownBy(()->policy.accept("505",input.put("power",.8),state,1200)).hasMessage("ALKKAGI_SPECTATOR_ID_CONFLICT");
    }
    @Test void 이전차례_상대알_장외_과다빈도는_거절한다() throws Exception {
        var policy=new AlkkagiSpectatorPolicy();var state=state();
        assertThatThrownBy(()->policy.accept("505",cursor().put("basedOnVersion",2),state,1000)).hasMessage("ALKKAGI_SPECTATOR_STALE_VERSION");
        assertThatThrownBy(()->policy.accept("505",advice().put("pieceId","p16"),state,1000)).hasMessage("ALKKAGI_SPECTATOR_INVALID_TARGET");
        assertThatThrownBy(()->policy.accept("505",cursor().put("x",5),state,1000)).hasMessage("ALKKAGI_SPECTATOR_OUTSIDE_BOARD");
        policy.accept("505",cursor(),state,1000);
        assertThatThrownBy(()->policy.accept("505",cursor(),state,1079)).hasMessage("ALKKAGI_SPECTATOR_TOO_FREQUENT");
        assertThat(policy.accept("505",cursor(),state,1080).fresh()).isTrue();
    }
    @Test void 재전송은_만료뒤_거절하고_충돌중에는_거절한다() throws Exception {
        var policy=new AlkkagiSpectatorPolicy();var state=state();var input=cursor();
        policy.accept("505",input,state,1000);
        assertThatThrownBy(()->policy.accept("505",input,state,3000)).hasMessage("ALKKAGI_SPECTATOR_EXPIRED");
        state.put("stage","SIMULATING");
        assertThatThrownBy(()->policy.accept("505",advice(),state,3100)).hasMessage("ALKKAGI_SPECTATOR_NOT_AIMING");
    }
    @Test void 메시지는_추가필드와_잘못된종류_비정상수치를_거절한다() throws Exception {
        var protocol=new TableProtocol(mapper);var input=cursor();
        java.util.function.Function<ObjectNode,String> request=p->mapper.createObjectNode().put("requestId","r").put("type","ALKKAGI_SPECTATOR_SEND").set("payload",p).toString();
        assertThat(protocol.parse(request.apply(input)).type()).isEqualTo("ALKKAGI_SPECTATOR_SEND");
        assertThatThrownBy(()->protocol.parse(request.apply(input.deepCopy().put("userId","101")))).isInstanceOf(TableProtocol.RequestException.class);
        assertThatThrownBy(()->protocol.parse(request.apply(input.deepCopy().put("kind","SHOT")))).isInstanceOf(TableProtocol.RequestException.class);
        assertThatThrownBy(()->protocol.parse(request.apply(input.deepCopy().put("x","100")))).isInstanceOf(TableProtocol.RequestException.class);
        assertThat(protocol.parse(request.apply(advice())).type()).isEqualTo("ALKKAGI_SPECTATOR_SEND");
    }
}
