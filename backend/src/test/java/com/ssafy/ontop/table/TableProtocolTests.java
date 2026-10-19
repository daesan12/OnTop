package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class TableProtocolTests {

    private final TableProtocol protocol = new TableProtocol(new ObjectMapper());

    @Test
    void 오류의_요청_ID는_유효할_때만_반환한다() {
        RequestException readable = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\"request-1\",\"type\":\"TABLE_LEAVE\",\"payload\":{},\"extra\":1}"));
        RequestException invalid = catchThrowableOfType(RequestException.class, () -> protocol.parse(
                "{\"requestId\":\" \",\"type\":\"TABLE_LEAVE\",\"payload\":{}}"));

        assertThat(readable.requestId()).isEqualTo("request-1");
        assertThat(readable.code()).isEqualTo("INVALID_MESSAGE");
        assertThat(invalid.requestId()).isNull();
    }

    @Test
    void 요청_ID는_64자까지_허용한다() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        String valid = mapper.writeValueAsString(Map.of("requestId", "a".repeat(64),
                "type", "TABLE_LEAVE", "payload", Map.of()));
        String invalid = valid.replace("a".repeat(64), "a".repeat(65));

        assertThat(protocol.parse(valid).requestId()).hasSize(64);
        assertThat(catchThrowableOfType(RequestException.class, () -> protocol.parse(invalid)).requestId()).isNull();
    }

    @Test
    void 빈_입력과_중복_JSON_키는_거절한다() {
        for (String text : new String[] {"", "{\"requestId\":\"a\",\"requestId\":\"b\"}"}) {
            RequestException error = catchThrowableOfType(RequestException.class, () -> protocol.parse(text));

            assertThat(error.code()).isEqualTo("INVALID_JSON");
            assertThat(error.requestId()).isNull();
        }
    }
}
