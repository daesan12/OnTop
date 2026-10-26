package com.ssafy.ontop.game.start;

import com.ssafy.ontop.table.domain.TableGame;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Objects;

/** 유효한 내부 시작 요청의 불변 스냅샷. 잠금 순서와 원래 참가자 순서를 구분한다. */
public final class GameReservationRequest {
    private final GameStartCommand command;
    private final List<Long> userIds;
    private final byte[] fingerprint;

    private GameReservationRequest(GameStartCommand command, List<Long> userIds, byte[] fingerprint) {
        this.command = command;
        this.userIds = userIds;
        this.fingerprint = fingerprint;
    }

    public static GameReservationRequest from(GameStartCommand command) {
        Objects.requireNonNull(command);
        TableGame game = TableGame.find(command.gameCode());
        if (game == null || command.tableId().length() > 120
                || command.participants().size() < game.minimumPlayers()
                || command.participants().size() > game.maximumPlayers()
                || "DICE".equals(command.gameCode()) && command.targetScore() == null) {
            throw new IllegalArgumentException("영속 경기 시작 요청을 확인하세요.");
        }
        List<Long> users = command.participants().stream().map(player -> GameIdCodec.parse(player.userId())).toList();
        return new GameReservationRequest(command, users, fingerprint(command, users));
    }

    private static byte[] fingerprint(GameStartCommand command, List<Long> users) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream output = new DataOutputStream(bytes)) {
                output.writeInt(1); // 직렬화 규격 버전. JSON 키 순서나 구분자 충돌에 의존하지 않는다.
                output.writeUTF(command.tableId());
                output.writeLong(command.tableVersion());
                output.writeUTF(command.gameCode());
                output.writeInt(command.targetScore() == null ? 0 : command.targetScore());
                output.writeInt(users.size());
                for (int index = 0; index < users.size(); index++) {
                    output.writeLong(users.get(index));
                    output.writeInt(command.participants().get(index).seatNumber());
                }
            }
            return MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("시작 요청 fingerprint를 생성할 수 없습니다.", exception);
        }
    }

    public GameStartCommand command() { return command; }
    public List<Long> userIds() { return userIds; }
    public List<Long> lockOrder() { return userIds.stream().sorted().toList(); }
    public byte[] fingerprint() { return fingerprint.clone(); }
}
