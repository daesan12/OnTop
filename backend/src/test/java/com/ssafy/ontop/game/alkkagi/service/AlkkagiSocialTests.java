package com.ssafy.ontop.game.alkkagi.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.alkkagi.domain.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AlkkagiSocialTests {
    private final ObjectMapper mapper = new ObjectMapper();
    @Test
    void 훈수는_관전자와_현재차례알만_허용하며_물리를_바꾸지_않는다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.start(0);
        var before = m.snapshot(0); var room = new AlkkagiSocialRoom(before.gameId());
        var input = advice(before.gameId(), before.version());
        assertThatThrownBy(() -> room.apply("red", "홍팀", 0, input, before, 1)).hasMessage("SPECTATOR_REQUIRED");
        var wrong = input.deepCopy().put("pieceId", "p16");
        assertThatThrownBy(() -> room.apply("viewer", "관전자", -1, wrong, before, 1)).hasMessage("INVALID_ADVICE_TARGET");
        room.apply("viewer", "관전자", -1, input, before, 1);
        assertThat(room.snapshot(before, 1).advice()).hasSize(1);
        assertThat(m.snapshot(1).pieces()).isEqualTo(before.pieces());
        assertThat(m.snapshot(1).simulationId()).isZero(); assertThat(m.snapshot(1).version()).isEqualTo(before.version());
        assertThat(room.snapshot(before, 4001).advice()).isEmpty();
    }

    @Test
    void 훈수는_관전자별_최신하나_전역세개로_제한하며_턴변경에_지운다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.start(0); var s = m.snapshot(0);
        var room = new AlkkagiSocialRoom(s.gameId());
        for (int i = 0; i < 6; i++) room.apply("v" + i, "관전자" + i, -1, advice(s.gameId(), s.version()), s, i);
        assertThat(room.snapshot(s, 10).advice()).hasSize(3);
        m.advance(30_000); assertThat(room.snapshot(m.snapshot(30_000), 30_000).advice()).isEmpty();
    }

    @Test
    void 채팅은_중복제거_빈도_길이_이전경기를_검사한다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); var s = m.snapshot(0); var room = new AlkkagiSocialRoom(s.gameId());
        var chat = mapper.createObjectNode().put("type", "CHAT").put("gameId", s.gameId()).put("actionId", "chat-1").put("text", "<b>안녕</b>");
        room.apply("v", "관전자", -1, chat, s, 0); room.apply("v", "관전자", -1, chat, s, 1);
        assertThat(room.snapshot(s, 1).chat()).hasSize(1);
        assertThatThrownBy(() -> room.apply("v", "관전자", -1, chat.deepCopy().put("text", "다른 내용"), s, 2)).hasMessage("ACTION_ID_CONFLICT");
        assertThatThrownBy(() -> room.apply("v", "관전자", -1, chat.deepCopy().put("actionId", "chat-2"), s, 2)).hasMessage("CHAT_RATE_LIMIT");
        assertThatThrownBy(() -> room.apply("v", "관전자", -1, chat.deepCopy().put("actionId", "chat-3").put("text", "x".repeat(201)), s, 1000)).hasMessage("INVALID_CHAT");
        assertThatThrownBy(() -> room.apply("v", "관전자", -1, chat.deepCopy().put("gameId", "old"), s, 1000)).hasMessage("STALE_GAME");
        for (int i = 1; i <= 60; i++) room.apply("v", "관전자", -1, chat.deepCopy().put("actionId", "c-" + i), s, i * 1000);
        assertThat(room.snapshot(s, 61_000).chat()).hasSizeBetween(1, 50);
        assertThat(room.snapshot(s, 61_000).chat().getLast().id()).endsWith(":chat:61");
    }

    @Test
    void 커서는_유한좌표만_허용하고_연결종료와_유효기간에_제거한다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); var s = m.snapshot(0); var room = new AlkkagiSocialRoom(s.gameId());
        var c = mapper.createObjectNode().put("type", "CURSOR").put("gameId", s.gameId()).put("x", 1).put("y", 0);
        room.apply("a", "관전자", -1, c, s, 0); assertThat(room.snapshot(s, 0).cursors()).hasSize(1);
        assertThatThrownBy(() -> room.apply("a", "관전자", -1, c.deepCopy().put("x", 100), s, 100)).hasMessage("INVALID_CURSOR");
        room.retainSessions(java.util.Set.of()); assertThat(room.snapshot(s, 100).cursors()).isEmpty();
        room.apply("a", "관전자", -1, c, s, 200); assertThat(room.snapshot(s, 2200).cursors()).isEmpty();
    }

    private ObjectNode advice(String gameId, long version) {
        return mapper.createObjectNode().put("type", "ADVICE").put("gameId", gameId).put("actionId", "advice")
                .put("expectedVersion", version).put("pieceId", "p13").put("dx", 0).put("dy", -1).put("power", .5);
    }

    @Test
    void 긴_유니코드_채팅도_공개프레임_크기한도_안에_남는다() throws Exception {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); var s = m.snapshot(0); var room = new AlkkagiSocialRoom(s.gameId());
        for (int i = 0; i < 60; i++) room.apply("v", "관전자", -1, mapper.createObjectNode().put("type", "CHAT")
                .put("gameId", s.gameId()).put("actionId", "unicode-" + i).put("text", "🎲".repeat(200)), s, i * 1000L);
        var publicFrame = (ObjectNode) mapper.valueToTree(s);
        publicFrame.set("social", mapper.valueToTree(room.snapshot(s, 60_000)));
        assertThat(mapper.writeValueAsBytes(publicFrame).length).isLessThan(24_000);
    }
}
