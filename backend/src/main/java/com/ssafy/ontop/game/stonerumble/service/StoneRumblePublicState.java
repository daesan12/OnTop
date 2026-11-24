package com.ssafy.ontop.game.stonerumble.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.stonerumble.domain.StoneRumbleMatch;

/** 불변인 육각 좌표는 버전 계약으로 공유하고, 현재까지 바뀐 발판만 완결된 스냅샷으로 보낸다. */
public final class StoneRumblePublicState {
    private StoneRumblePublicState() { }

    public static ObjectNode encode(ObjectMapper mapper, StoneRumbleMatch.Snapshot snapshot) {
        ObjectNode state = mapper.createObjectNode()
                .put("gameCode", snapshot.gameCode()).put("tileLayout", snapshot.tileLayout())
                .put("status", snapshot.status()).put("serverTime", snapshot.serverTime())
                .put("startsAt", snapshot.startsAt()).put("endedAt", snapshot.endedAt())
                .put("endReason", snapshot.endReason()).put("landsAt", snapshot.landsAt()).put("phase", snapshot.phase());
        state.set("winnerUserIds", mapper.valueToTree(snapshot.winnerUserIds()));
        state.set("readyUserIds", mapper.valueToTree(snapshot.readyUserIds()));
        state.set("players", mapper.valueToTree(snapshot.players()));
        state.set("pigeons", mapper.valueToTree(snapshot.pigeons()));
        var marks = state.putArray("tileMarks");
        for (var tile : snapshot.tiles()) {
            if (tile.breakAt() < 9_007_199_254_740_991L) {
                marks.addArray().add(tile.id()).add(tile.breakAt()).add(tile.stepped() ? 1 : 0);
            }
        }
        return state;
    }
}
