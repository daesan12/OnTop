package com.ssafy.ontop.game.jumprope;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public final class JumpRopeDtos {
    private JumpRopeDtos() { }

    @Schema(name = "JumpRopeRound")
    public record Round(String id, long seed, int rulesVersion, Instant serverNow, Instant startedAt,
                        Instant expiresAt, int durationMs) { }

    @JsonDeserialize(using = CompleteDeserializer.class)
    @Schema(name = "JumpRopeComplete", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    public record Complete(
            @ArraySchema(arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    description = "실제 플레이 경과 시간을 Math.round(elapsedMs * 1000)으로 정규화한 오름차순 점프 로그",
                    example = "[728335,1723348]"), maxItems = JumpRopeRules.MAX_INPUTS, uniqueItems = true,
                    schema = @Schema(type = "integer", minimum = "0", maximum = "59999999"))
            List<Integer> jumpOffsetsUs,
            @ArraySchema(arraySchema = @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED,
                    description = "rulesVersion 2 판에서만 필수인 숙이기(↓/S) 유지 구간 목록. 각 항목은 정확히 두 정수 [startUs, endUs]입니다. "
                            + "점프 로그와 같은 실제 플레이 시계의 정수 μs이며, 0 ≤ startUs < endUs ≤ 60000000, "
                            + "앞 구간의 endUs < 다음 startUs인 오름차순입니다. 판이 끝날 때 누르고 있던 구간은 "
                            + "마지막 플레이 시각(60초 완주 60000000, MISS 3회는 3번째 MISS 통과 시각)으로 닫습니다. "
                            + "rulesVersion 1 판에는 보내지 않습니다.",
                    example = "[[21950000,22650000]]"), maxItems = JumpRopeRulesV2.MAX_DUCK_SPANS,
                    schema = @Schema(example = "[21950000,22650000]"))
            List<List<Integer>> duckSpansUs) { }

    @Schema(name = "JumpRopeCounts")
    public record Counts(int perfect, int good, int miss) { }

    @Schema(name = "JumpRopeResult")
    public record Result(String id, int rulesVersion, int score, Counts counts,
                         @Schema(allowableValues = {"time", "missLimit"}) String endReason, Instant completedAt,
                         @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0",
                                 description = "실제 지급한 엽전. 60초 완주 점수 50점당 1냥(버림)에 공통 일일 한도를 적용합니다. 조기 종료, 50점 미만, 한도 소진 또는 보상 도입 전 확정 기록은 0입니다.")
                         int reward) {
        Result withReward(int granted) {
            return new Result(id, rulesVersion, score, counts, endReason, completedAt, granted);
        }
    }

    @Schema(name = "JumpRopeRankingItem")
    public record Item(long rank, String nickname, int score) { }

    @Schema(name = "JumpRopePersonalBest", nullable = true)
    public record PersonalBest(long rank, String nickname, int score) { }

    @Schema(name = "JumpRopeRankings")
    public record Rankings(int rulesVersion, @Schema(allowableValues = "ALL_TIME") String period,
                           Instant updatedAt, long totalParticipants, int offset, int limit, List<Item> items,
                           @JsonInclude(JsonInclude.Include.ALWAYS) @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
                           PersonalBest me, boolean hasMore) { }

    @Schema(name = "JumpRopeError")
    public record Error(String code, String message) { }

    /**
     * Reject numeric strings, floats, nulls, unknown or duplicate fields and oversized logs before binding a list.
     * Fields may come in any order; jumpOffsetsUs is required and duckSpansUs, when present, holds integer pairs.
     */
    static final class CompleteDeserializer extends JsonDeserializer<Complete> {
        @Override
        public Complete deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (parser.currentToken() != JsonToken.START_OBJECT) return invalid(context);
            List<Integer> offsets = null;
            List<List<Integer>> spans = null;
            while (parser.nextToken() == JsonToken.FIELD_NAME) {
                String name = parser.currentName();
                parser.nextToken();
                if ("jumpOffsetsUs".equals(name) && offsets == null) {
                    offsets = integers(parser, JumpRopeRules.MAX_INPUTS);
                    if (offsets == null) return invalid(context);
                } else if ("duckSpansUs".equals(name) && spans == null) {
                    spans = pairs(parser);
                    if (spans == null) return invalid(context);
                } else {
                    return invalid(context);
                }
            }
            if (parser.currentToken() != JsonToken.END_OBJECT || offsets == null) return invalid(context);
            return new Complete(offsets, spans);
        }

        /** An array of at most {@code limit} int32 tokens at the current position, or null. */
        private static List<Integer> integers(JsonParser parser, int limit) throws IOException {
            if (parser.currentToken() != JsonToken.START_ARRAY) return null;
            var values = new ArrayList<Integer>();
            while (parser.nextToken() != JsonToken.END_ARRAY) {
                if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT || values.size() >= limit) return null;
                values.add(parser.getIntValue());
            }
            return List.copyOf(values);
        }

        private static List<List<Integer>> pairs(JsonParser parser) throws IOException {
            if (parser.currentToken() != JsonToken.START_ARRAY) return null;
            var pairs = new ArrayList<List<Integer>>();
            while (parser.nextToken() != JsonToken.END_ARRAY) {
                if (pairs.size() >= JumpRopeRulesV2.MAX_DUCK_SPANS) return null;
                var pair = integers(parser, 2);
                if (pair == null || pair.size() != 2) return null;
                pairs.add(pair);
            }
            return List.copyOf(pairs);
        }

        private static Complete invalid(DeserializationContext context) throws IOException {
            return context.reportInputMismatch(Complete.class,
                    "Expected an integer jumpOffsetsUs array and optional integer duckSpansUs pairs");
        }
    }
}
