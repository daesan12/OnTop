package com.ssafy.ontop.game.start;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameReservationRequestTests {
    @Test
    void 같은_내용은_같은_fingerprint이며_잠금순서와_원래순서를_분리한다() {
        var command = command("table", 1, "OMOK", null, "20", "10");
        var first = GameReservationRequest.from(command);
        var second = GameReservationRequest.from(command);

        assertThat(first.fingerprint()).hasSize(32).isEqualTo(second.fingerprint());
        assertThat(first.userIds()).containsExactly(20L, 10L);
        assertThat(first.lockOrder()).containsExactly(10L, 20L);
        first.fingerprint()[0]++;
        assertThat(first.fingerprint()).isEqualTo(second.fingerprint());
    }

    @Test
    void 테이블_버전_게임_목표점수_참가순서_좌석을_fingerprint에_포함한다() {
        var original = command("table", 1, "DICE", 2000, "10", "20");
        byte[] fingerprint = GameReservationRequest.from(original).fingerprint();
        var changedSeat = new GameStartCommand(original.startAttemptId(), "table", 1, "DICE", List.of(
                new GameStartCommand.Participant("10", 3), new GameStartCommand.Participant("20", 4)), 2000);
        for (var changed : List.of(command("other", 1, "DICE", 2000, "10", "20"),
                command("table", 2, "DICE", 2000, "10", "20"),
                command("table", 1, "DICE", 4000, "10", "20"),
                command("table", 1, "OMOK", null, "10", "20"),
                command("table", 1, "DICE", 2000, "20", "10"), changedSeat)) {
            assertThat(GameReservationRequest.from(changed).fingerprint()).isNotEqualTo(fingerprint);
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4})
    void 주사위_예약은_선택한_모든_좌석과_목표를_보존한다(int count) {
        String[] users = java.util.stream.IntStream.rangeClosed(1, count).mapToObj(String::valueOf).toArray(String[]::new);
        var request = GameReservationRequest.from(command("table", 1, "DICE", 4000, users));

        assertThat(request.userIds()).hasSize(count);
        assertThat(request.command().targetScore()).isEqualTo(4000);
    }

    @Test
    void 지원하지않는_게임과_인원과_주사위목표누락은_DB전에_거절한다() {
        for (var invalid : List.of(command("table", 1, "UNKNOWN", null, "10", "20"),
                command("table", 1, "OMOK", null, "10", "20", "30"),
                command("table", 1, "DICE", null, "10", "20"),
                command("x".repeat(121), 1, "OMOK", null, "10", "20"))) {
            assertThatThrownBy(() -> GameReservationRequest.from(invalid)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"0", "-1", "01", "+1", " 1", "1.0", "demo-game", "9223372036854775808"})
    void DB_ID는_정규_양수_long만_허용한다(String value) {
        assertThatThrownBy(() -> GameIdCodec.parse(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void BIGINT_최대값을_손실없이_왕복한다() {
        assertThat(GameIdCodec.parse(GameIdCodec.format(Long.MAX_VALUE))).isEqualTo(Long.MAX_VALUE);
        assertThatThrownBy(() -> GameIdCodec.format(0)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 기존1코인_직렬화해시를_보존하고_다른금액을_구분한다() throws Exception {
        var original = command("table", 1, "OMOK", null, "10", "20");
        var bytes = new java.io.ByteArrayOutputStream();
        try (var out = new java.io.DataOutputStream(bytes)) {
            out.writeInt(1); out.writeUTF("table"); out.writeLong(1); out.writeUTF("OMOK"); out.writeInt(0);
            out.writeInt(2); out.writeLong(10); out.writeInt(1); out.writeLong(20); out.writeInt(2);
        }
        byte[] legacy = java.security.MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray());
        assertThat(GameReservationRequest.from(original).fingerprint()).isEqualTo(legacy);
        var changed = new GameStartCommand(original.startAttemptId(), "table", 1, "OMOK", original.participants(), null, 5);
        assertThat(GameReservationRequest.from(changed).fingerprint()).isNotEqualTo(legacy);
    }

    private GameStartCommand command(String table, long version, String game, Integer target, String... users) {
        List<GameStartCommand.Participant> players = java.util.stream.IntStream.range(0, users.length)
                .mapToObj(index -> new GameStartCommand.Participant(users[index], index + 1)).toList();
        return new GameStartCommand(UUID.randomUUID(), table, version, game, players, target);
    }
}
