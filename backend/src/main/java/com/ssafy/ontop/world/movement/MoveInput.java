package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Set;

public record MoveInput(long seq, double dx, double dz, boolean run, boolean jump) {
    public MoveInput {
        if (seq < 1
                || seq > 0xffff_ffffL
                || !Double.isFinite(dx)
                || !Double.isFinite(dz)
                || Math.abs(dx) > 1
                || Math.abs(dz) > 1) {
            throw new IllegalArgumentException("유효한 입력 순번과 이동 방향이 필요합니다.");
        }
        double length = Math.max(1, Math.hypot(dx, dz));
        dx /= length;
        dz /= length;
    }

    public static MoveInput parse(JsonNode node) {
        if (node == null
                || !node.isObject()
                || !node.has("seq")
                || !node.has("dx")
                || !node.has("dz")
                || !node.has("run")
                || !node.get("seq").isIntegralNumber()
                || !node.get("seq").canConvertToLong()
                || !node.get("dx").isNumber()
                || !node.get("dz").isNumber()
                || !node.get("run").isBoolean()
                || (node.has("jump") && !node.get("jump").isBoolean())) {
            throw new IllegalArgumentException("이동 입력 형식을 확인해주세요.");
        }
        var fields = node.fieldNames();
        while (fields.hasNext()) {
            if (!Set.of("seq", "dx", "dz", "run", "jump").contains(fields.next())) {
                throw new IllegalArgumentException("좌표 등 추가 필드는 허용하지 않습니다.");
            }
        }
        return new MoveInput(
                node.get("seq").longValue(),
                node.get("dx").doubleValue(),
                node.get("dz").doubleValue(),
                node.get("run").booleanValue(),
                node.path("jump").asBoolean());
    }
}
