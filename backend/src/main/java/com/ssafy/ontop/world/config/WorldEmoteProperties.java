package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.domain.EmoteCode;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("ontop.world.emote")
public record WorldEmoteProperties(List<String> codes) {

    public WorldEmoteProperties {
        codes = codes == null ? List.of() : List.copyOf(codes);
        Set<String> unique = new HashSet<>();
        for (String code : codes) {
            new EmoteCode(code);
            if (!unique.add(code)) throw new IllegalArgumentException("감정표현 코드는 중복될 수 없습니다.");
        }
    }
}
