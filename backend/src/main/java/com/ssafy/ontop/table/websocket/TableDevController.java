package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
public class TableDevController {

    private final WorldChannelProperties world;
    private final boolean authenticated;
    private final Duration movementInterval;
    private final Duration chatInterval;
    private final WorldEmoteProperties emotes;
    private final Duration emoteInterval;

    public TableDevController(WorldChannelProperties world,
            @Value("${ontop.websocket.authenticated:false}") boolean authenticated,
            @Value("${ontop.world.movement.minimum-interval:100ms}") Duration movementInterval,
            @Value("${ontop.world.chat.minimum-interval:1s}") Duration chatInterval,
            WorldEmoteProperties emotes,
            @Value("${ontop.world.emote.minimum-interval:1s}") Duration emoteInterval) {
        this.world = world;
        this.authenticated = authenticated;
        this.movementInterval = movementInterval;
        this.chatInterval = chatInterval;
        this.emotes = emotes;
        this.emoteInterval = emoteInterval;
    }

    @GetMapping(value = "/dev/tables", produces = MediaType.TEXT_HTML_VALUE)
    public Resource page() {
        return new ClassPathResource("dev/tables.html");
    }

    @GetMapping("/dev/world-config")
    public ResponseEntity<WorldConfig> worldConfig() {
        if (authenticated) {
            return ResponseEntity.notFound().cacheControl(CacheControl.noStore()).build();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new WorldConfig(world.channels(),
                Math.max(1, movementInterval.toMillis()), Math.max(1, chatInterval.toMillis()),
                emotes.codes(), Math.max(1, emoteInterval.toMillis())));
    }

    public record WorldConfig(List<WorldChannelProperties.Channel> channels, long movementIntervalMs,
            long chatIntervalMs, List<String> emoteCodes, long emoteIntervalMs) {
    }
}
