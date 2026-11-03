package com.ssafy.ontop.world.jumpmap;

/** 과거 고정 시간 검사만 실패한 기록을 데이터 수정 없이 조회 시 재평가한다. 쿼리 별칭은 r이다. */
public final class JumpmapRankingEligibility {
    // 시간 검사에서 먼저 반환했던 판은 착지 검사를 안 했으므로 저장된 7구간 착지를 다시 검사한다.
    public static final String SQL = """
            (r.suspicious = FALSE OR (
                r.suspicious = TRUE
                AND JSON_SCHEMA_VALID(
                    '{"type":"array","minItems":1,"items":{"type":"string","enum":[
                        "TOO_FAST:1","TOO_FAST:2","TOO_FAST:3","TOO_FAST:4",
                        "TOO_FAST:5","TOO_FAST:6","TOO_FAST:7"]}}', r.suspicious_reasons) = 1
                AND JSON_SCHEMA_VALID(
                    '{"type":"array","minItems":7,"maxItems":7,"items":[
                        {"type":"integer","minimum":12},{"type":"integer","minimum":5},
                        {"type":"integer","minimum":7},{"type":"integer","minimum":7},
                        {"type":"integer","minimum":9},{"type":"integer","minimum":10},
                        {"type":"integer","minimum":7}]}', r.landings) = 1
            ))
            """;

    private JumpmapRankingEligibility() { }
}
