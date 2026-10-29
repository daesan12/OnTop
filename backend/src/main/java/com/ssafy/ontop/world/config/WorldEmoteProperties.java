package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.domain.EmoteCode;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties("ontop.world.emote")
public record WorldEmoteProperties(List<String> codes, Map<String, Duration> cooldowns,
        Map<String, Duration> durations) {

    public WorldEmoteProperties(List<String> codes) {
        this(codes, Map.of(), null);
    }

    public WorldEmoteProperties(List<String> codes, Map<String, Duration> cooldowns) {
        this(codes, cooldowns, null);
    }

    @ConstructorBinding
    public WorldEmoteProperties {
        codes = codes == null ? List.of() : List.copyOf(codes);
        cooldowns = cooldowns == null ? Map.of() : Map.copyOf(cooldowns);
        // FE config/emotes.ts와 NETWORK.emoteDurationMs의 재생 길이. 쿨다운과 별개다.
        Map<String, Duration> playback = new java.util.HashMap<>(Map.of("WAVE", Duration.ofMillis(2600),
                "CLAP", Duration.ofMillis(4867), "APPLAUSE_REQUEST", Duration.ofMillis(1600),
                "TSK", Duration.ofMillis(1600), "FART", Duration.ofMillis(1600)));
        if (durations != null) { playback.putAll(durations); }
        durations = Map.copyOf(playback);
        Set<String> unique = new HashSet<>();
        for (String code : codes) {
            new EmoteCode(code);
            if (!unique.add(code)) throw new IllegalArgumentException("감정표현 코드는 중복될 수 없습니다.");
        }
        for (var entry : java.util.stream.Stream.concat(cooldowns.entrySet().stream(), durations.entrySet().stream()).toList()) {
            new EmoteCode(entry.getKey());
            Duration interval = entry.getValue();
            if (interval.isNegative() || interval.isZero() || interval.compareTo(Duration.ofSeconds(60)) > 0) {
                throw new IllegalArgumentException("감정표현별 간격·재생 길이는 0 초과 60초 이하여야 합니다.");
            }
        }
    }
}
