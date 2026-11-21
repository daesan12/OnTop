package com.ssafy.ontop.game.davinci;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DavinciWorldTests {
    @Test
    void 같은_채널의_테이블에만_타일을_투영하고_제거해도_좌석은_유지한다() {
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "공원 하나", 8),
                new WorldChannelProperties.Channel("two", "공원 둘", 8))));
        registry.join("101", "one"); registry.join("202", "two");
        registry.tables("one", List.of(new WorldChannelRegistry.PublicTable("table-one", "anchor", 4, "DAVINCI_CODE")));
        registry.tables("two", List.of(new WorldChannelRegistry.PublicTable("table-two", "anchor", 2, "OMOK")));
        var view = new ObjectMapper().createObjectNode().put("gameId", "game");
        registry.secretTilePresentations(Map.of("table-one", view));
        assertThat(registry.worldState("one").tables().getFirst().secretTiles()).isEqualTo(view);
        assertThat(registry.worldState("two").tables().getFirst().secretTiles()).isNull();
        registry.secretTilePresentations(Map.of());
        var cleared = registry.worldState("one").tables().getFirst();
        assertThat(cleared.secretTiles()).isNull();
        assertThat(cleared.chairCount()).isEqualTo(4);
        assertThat(cleared.anchorId()).isEqualTo("anchor");
    }
}
