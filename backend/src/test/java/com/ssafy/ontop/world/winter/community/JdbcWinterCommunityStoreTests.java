package com.ssafy.ontop.world.winter.community;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** DB 실행을 대신하지 않고 JDBC 호출 횟수와 재시도 시 쓰기 여부를 검증한다. */
@SuppressWarnings({"unchecked", "rawtypes"})
class JdbcWinterCommunityStoreTests {
    private static final String ACTOR = "a".repeat(64);
    private static final String OPERATION = "00000000-0000-4000-8000-000000000001";
    private static final Instant NOW = Instant.parse("2026-11-22T00:00:00Z");

    @Test
    void 편지_등록은_집계를_원자적으로_늘리고_최종_장식_목록만_한번_조회한다() {
        var fixture = new Fixture(List.of(), List.of());

        var receipt = fixture.post("응원합니다");

        assertThat(receipt.status()).isEqualTo(fixture.status);
        assertThat(receipt.message().id()).isEqualTo(50);
        assertThat(receipt.nextAllowedAt()).isEqualTo(NOW.plusSeconds(15).toString());
        var ordered = inOrder(fixture.jdbc);
        ordered.verify(fixture.jdbc).queryForObject(contains("FOR UPDATE"), eq(Integer.class));
        ordered.verify(fixture.jdbc).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        ordered.verify(fixture.jdbc).update(contains("message_count=message_count+1"),
                eq(WinterCommunity.TREE_TARGET), eq(LocalDateTime.ofInstant(NOW, ZoneOffset.UTC)));
        ordered.verify(fixture.jdbc).query(contains("LEFT JOIN"), any(ResultSetExtractor.class));
        verify(fixture.jdbc).query(contains("LEFT JOIN"), any(ResultSetExtractor.class));
    }

    @Test
    void 같은_편지의_재시도는_집계를_늘리지_않고_기존_영수증을_돌려준다() {
        var message = new WinterCommunity.TreeMessage(50, "응원합니다", true, null, "STOCKING", NOW.toString());
        var fixture = new Fixture(List.of(message), List.of());

        var receipt = fixture.post("응원합니다");

        assertThat(receipt.message()).isEqualTo(message);
        verify(fixture.jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
        verify(fixture.jdbc, never()).update(contains("message_count="), any(Object[].class));
        verify(fixture.jdbc).query(contains("LEFT JOIN"), any(ResultSetExtractor.class));
    }

    @Test
    void 재시도_내용이_바뀌거나_작성_대기시간이면_장식_목록을_조회하지_않는다() {
        var message = new WinterCommunity.TreeMessage(50, "응원합니다", true, null, "STOCKING", NOW.toString());
        var conflicting = new Fixture(List.of(message), List.of());
        var cooling = new Fixture(List.of(), List.of(NOW.minusSeconds(10)));

        assertThatThrownBy(() -> conflicting.post("다른 편지")).isInstanceOf(WinterCommunityException.class);
        assertThatThrownBy(() -> cooling.post("응원합니다")).isInstanceOf(WinterCommunityException.class);

        for (var fixture : List.of(conflicting, cooling)) {
            verify(fixture.jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
            verify(fixture.jdbc, never()).update(contains("message_count="), any(Object[].class));
            verify(fixture.jdbc, never()).query(contains("LEFT JOIN"), any(ResultSetExtractor.class));
        }
    }

    private static final class Fixture {
        final JdbcTemplate jdbc = mock(JdbcTemplate.class);
        final WinterCommunity.TreeStatus status = new WinterCommunity.TreeStatus(50, true, NOW.toString(), 50,
                List.of(new WinterCommunity.TreeOrnament(50, "STOCKING")));
        final JdbcWinterCommunityStore store;

        Fixture(List<WinterCommunity.TreeMessage> previous, List<Instant> latest) {
            var manager = mock(PlatformTransactionManager.class);
            when(manager.getTransaction(any(TransactionDefinition.class))).thenReturn(new SimpleTransactionStatus());
            when(jdbc.queryForObject(anyString(), eq(byte[].class))).thenReturn(new byte[32]);
            when(jdbc.queryForObject(contains("FOR UPDATE"), eq(Integer.class))).thenReturn(1);
            doReturn(previous).when(jdbc).query(contains("operation_id=?"), any(RowMapper.class), eq(ACTOR), eq(OPERATION));
            doReturn(latest).when(jdbc).query(contains("SELECT created_at"), any(RowMapper.class), eq(ACTOR));
            doReturn(status).when(jdbc).query(contains("LEFT JOIN"), any(ResultSetExtractor.class));
            doAnswer(call -> {
                KeyHolder keys = call.getArgument(1);
                keys.getKeyList().add(Map.of("id", 50L));
                return 1;
            }).when(jdbc).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
            store = new JdbcWinterCommunityStore(jdbc, manager);
        }

        WinterCommunity.TreeReceipt post(String text) {
            return store.postTree(ACTOR, OPERATION, text, true, null, "STOCKING", NOW);
        }
    }
}
