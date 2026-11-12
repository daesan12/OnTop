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
            List<Integer> jumpOffsetsUs) { }

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

    /** Reject numeric strings, floats, duplicate fields and oversized logs before binding a list. */
    static final class CompleteDeserializer extends JsonDeserializer<Complete> {
        @Override
        public Complete deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (parser.currentToken() != JsonToken.START_OBJECT || parser.nextToken() != JsonToken.FIELD_NAME
                    || !"jumpOffsetsUs".equals(parser.currentName()) || parser.nextToken() != JsonToken.START_ARRAY) {
                return invalid(context);
            }
            var offsets = new ArrayList<Integer>();
            while (parser.nextToken() != JsonToken.END_ARRAY) {
                if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT || offsets.size() >= JumpRopeRules.MAX_INPUTS) {
                    return invalid(context);
                }
                offsets.add(parser.getIntValue());
            }
            if (parser.nextToken() != JsonToken.END_OBJECT) return invalid(context);
            return new Complete(List.copyOf(offsets));
        }

        private static Complete invalid(DeserializationContext context) throws IOException {
            return context.reportInputMismatch(Complete.class, "Expected only an array of integer jumpOffsetsUs");
        }
    }
}
