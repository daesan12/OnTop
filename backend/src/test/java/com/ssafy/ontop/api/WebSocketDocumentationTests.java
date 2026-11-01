package com.ssafy.ontop.api;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WebSocketDocumentationTests {
    @Test
    void 중앙_문서가_실제_RawWebSocket_요청_42종을_모두_열거한다() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/ssafy/ontop/table/dto/TableProtocol.java"));
        var cases = Pattern.compile("case ((?:\"[^\"]+\"(?:,\\s*)?)+)\\s*->").matcher(source);
        var types = new HashSet<String>();
        while (cases.find()) {
            var literals = Pattern.compile("\"([^\"]+)\"").matcher(cases.group(1));
            while (literals.find()) { types.add(literals.group(1)); }
        }
        assertThat(types).hasSize(42);
        String index = Files.readString(Path.of("../docs/api/websocket.md"));
        types.forEach(type -> assertThat(index).contains(type));
        assertThat(index).contains("클라이언트 수신 ACK", "다중 노드", "다른 boot", "30초 유예");
    }

    @Test
    void 결과_문서가_조건부_null과_정산_전달_복구의_책임을_구분한다() throws Exception {
        String result = Files.readString(Path.of("../docs/game-result-api.md"));
        assertThat(result).contains("FINISHED는 result 필수", "result=null", "INVALID/PENDING", "INVALID/SETTLED",
                "myCoinDelta", "outbox", "최초 DB ACK 전", "클라이언트 수신 ACK", "SETTLING", "다른 boot");
        assertThat(result).doesNotContain("ABORTED_NO_PLAYERS의 무효 반환은 아직 구현하지 않았다",
                "주기적인 DB 폴링은 없다", "팀원의 결과 REST");
        String ready = Files.readString(Path.of("../docs/websocket-api/03-ready-set.md"));
        assertThat(ready).contains("betAmountPerPlayer", "expectedVersion", "{\"ready\":false}", "GAME_SETTINGS_CHANGED");
    }
}
