package com.ssafy.ontop.game.alkkagi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.alkkagi.domain.AlkkagiMatch;
import java.util.ArrayList;
import java.util.Set;

/** 공통 GAME_ACTION_SEND의 input만 해석한다. 회원/경기/카드 소유자는 서버에서 결정한다. */
public final class AlkkagiInputs {
    private AlkkagiInputs() { }

    public static long apply(AlkkagiMatch match, int actor, String actionId, long version, JsonNode input, long now) {
        if (input == null || !input.isObject() || !input.path("type").isTextual()) reject();
        String gameId = match.snapshot(now).gameId();
        return switch (input.path("type").asText()) {
            case "SHOT" -> {
                only(input, Set.of("type", "pieceId", "dx", "dy", "power"));
                if (!input.path("pieceId").isTextual() || !input.path("dx").isNumber()
                        || !input.path("dy").isNumber() || !input.path("power").isNumber()) reject();
                yield match.shoot(actor, new AlkkagiMatch.Shot(gameId, actionId, version, input.path("pieceId").asText(),
                        input.path("dx").asDouble(), input.path("dy").asDouble(), input.path("power").asDouble()), now);
            }
            case "ITEM_USE" -> {
                only(input, Set.of("type", "cardId", "targetPieceIds", "placement"));
                if (!input.path("cardId").isTextual() || !input.path("targetPieceIds").isArray()
                        || input.path("targetPieceIds").size() > 2) reject();
                var targets = new ArrayList<String>();
                for (var target : input.path("targetPieceIds")) {
                    if (!target.isTextual()) reject();
                    targets.add(target.asText());
                }
                AlkkagiMatch.Placement placement = null;
                if (input.has("placement")) {
                    var p = input.path("placement"); only(p, Set.of("x", "y", "angle"));
                    if (p.size() != 3 || !p.path("x").isNumber() || !p.path("y").isNumber() || !p.path("angle").isNumber()) reject();
                    placement = new AlkkagiMatch.Placement(p.path("x").asDouble(), p.path("y").asDouble(), p.path("angle").asDouble());
                }
                yield match.useItem(actor, new AlkkagiMatch.ItemUse(gameId, actionId, version,
                        input.path("cardId").asText(), targets, placement), now);
            }
            default -> throw new IllegalArgumentException("INVALID_ACTION");
        };
    }

    private static void only(JsonNode node, Set<String> allowed) {
        if (!node.isObject()) reject();
        node.fieldNames().forEachRemaining(field -> { if (!allowed.contains(field)) reject(); });
    }
    private static void reject() { throw new IllegalArgumentException("INVALID_ACTION"); }
}
