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
public record WorldEmoteProperties(List<String> codes, Map<String, Duration> cooldowns) {

    public WorldEmoteProperties(List<String> codes) {
        this(codes, Map.of());
    }

    @ConstructorBinding
    public WorldEmoteProperties {
        codes = codes == null ? List.of() : List.copyOf(codes);
        cooldowns = cooldowns == null ? Map.of() : Map.copyOf(cooldowns);
        Set<String> unique = new HashSet<>();
        for (String code : codes) {
            new EmoteCode(code);
            if (!unique.add(code)) throw new IllegalArgumentException("감정표현 코드는 중복될 수 없습니다.");
        }
        for (var entry : cooldowns.entrySet()) {
            new EmoteCode(entry.getKey());
            Duration interval = entry.getValue();
            if (interval.isNegative() || interval.isZero() || interval.compareTo(Duration.ofSeconds(60)) > 0) {
                throw new IllegalArgumentException("감정표현별 간격은 0 초과 60초 이하여야 합니다.");
            }
        }
    }
}
