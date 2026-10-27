package com.ssafy.ontop.api;

import io.swagger.v3.oas.models.media.Schema;
import java.util.ArrayList;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** JSON 직렬화는 변경하지 않고, 실제 응답의 필드 존재/nullable만 문서화한다. */
@Component
@Profile("(local | dev) & !prod & !production")
public class OpenApiResponseSchemaCustomizer implements OpenApiCustomizer {
    @Override
    public void customise(io.swagger.v3.oas.models.OpenAPI api) {
        var schemas = api.getComponents().getSchemas();
        for (String name : List.of("Ticket", "TableSummaryResponse", "TableListResponse", "ChannelListResponse",
                "ChannelResponse", "ItemResponse", "OwnedItemResponse", "EquipmentResponse", "InventoryResponse",
                "ItemListResponse", "PurchaseResponse", "MinigameStartResponse", "MinigameCompleteResponse",
                "MinigameAbandonResponse", "MinigameStatusResponse", "BungeoppangStatusResponse", "RankingResponse",
                "RankingItem", "RankingMyRank", "FeedbackListResponse", "Entry", "FeedbackReceiptResponse",
                "NoteResponse", "NoteReceiptResponse", "NoteListResponse", "FeedbackErrorResponse",
                "NotesErrorResponse", "ShopErrorResponse", "MinigameErrorResponse")) {
            var schema = schemas.get(name);
            if (schema != null && schema.getProperties() != null) {
                // null을 허용하는 필드도 JSON에는 항상 존재한다.
                schema.setRequired(new ArrayList<>(schema.getProperties().keySet()));
            }
        }
        for (var field : List.of("TableSummaryResponse.gameCode", "TableSummaryResponse.targetScore",
                "ItemResponse.equipSlot", "MinigameStatusResponse.score", "MinigameStatusResponse.endedAt",
                "FeedbackListResponse.nextCursor", "Entry.authorUserId", "FeedbackErrorResponse.nextAllowedAt",
                "NotesErrorResponse.nextAllowedAt", "ShopErrorResponse.details", "MinigameErrorResponse.details",
                "MinigameErrorResponse.detail", "MinigameErrorResponse.index")) {
            var parts = field.split("\\.");
            var schema = schemas.get(parts[0]);
            if (schema != null) { ((Schema<?>) schema.getProperties().get(parts[1])).setNullable(true); }
        }
    }
}
