package com.ssafy.ontop.table.domain;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

// TableHub의 상태 잠금 안에서만 접근한다. 연결 객체나 DB 엔티티를 보관하지 않는다.
public final class TableRoom {

    private final String tableId;
    private final String[] users = new String[4];
    private final boolean[] ready = new boolean[4];
    private final LinkedHashSet<String> arrivalOrder = new LinkedHashSet<>();
    private TableGame game;
    private Integer targetScore;
    private Long betAmountPerPlayer;
    private long version;
    // 별도 카운터가 아니라 기존 TABLE_STATE.version 중 마지막 준비 초기화 시점이다.
    private long readyResetVersion;

    public TableRoom(String tableId) {
        this.tableId = tableId;
    }

    public boolean join(String userId) {
        for (int index = 0; index < capacity(); index++) {
            if (users[index] == null) {
                users[index] = userId;
                arrivalOrder.add(userId);
                membershipChanged();
                return true;
            }
        }
        return false;
    }

    public void leave(String userId) {
        users[indexOf(userId)] = null;
        arrivalOrder.remove(userId);
        if (arrivalOrder.isEmpty()) {
            game = null;
            targetScore = null;
            betAmountPerPlayer = null;
        }
        membershipChanged();
    }

    public boolean isSelector(String userId) {
        return !arrivalOrder.isEmpty() && arrivalOrder.getFirst().equals(userId);
    }

    public boolean selectGame(TableGame selected) {
        return selectGame(selected, null);
    }

    public boolean selectGame(TableGame selected, Integer target) {
        return selectGame(selected, target, 1);
    }

    public boolean selectGame(TableGame selected, Integer target, long amount) {
        com.ssafy.ontop.game.domain.GameAmounts.validate(amount, selected.maximumPlayers());
        if (target != null && (selected != TableGame.DICE || !Set.of(2000, 4000, 6000).contains(target))) {
            throw new IllegalArgumentException("주사위 목표를 확인해주세요.");
        }
        if (game == selected && java.util.Objects.equals(targetScore, target)
                && java.util.Objects.equals(betAmountPerPlayer, amount)) {
            return false;
        }
        if (arrivalOrder.size() > selected.maximumPlayers()) {
            throw new IllegalArgumentException("선택한 게임의 최대 인원을 초과했습니다.");
        }
        // 정원이 줄어들면 상위 좌석의 참가자가 사라지지 않도록 착석 순서대로 재배치한다.
        if (selected.maximumPlayers() < capacity()) {
            Arrays.fill(users, null);
            int index = 0;
            for (String user : arrivalOrder) {
                users[index++] = user;
            }
        }
        game = selected;
        targetScore = target;
        betAmountPerPlayer = amount;
        membershipChanged();
        return true;
    }

    public boolean setReady(String userId, boolean value) {
        int index = indexOf(userId);
        if (ready[index] == value) {
            return false;
        }
        ready[index] = value;
        version++;
        return true;
    }

    public boolean matchesReadyBet(long amount) {
        return betAmountPerPlayer != null && betAmountPerPlayer == amount;
    }

    public boolean acceptsReadyVersion(long observedVersion) {
        // 다른 참가자의 준비/일반 공개 상태 변화는 동의를 무효화하지 않는다.
        return observedVersion >= readyResetVersion && observedVersion <= version;
    }

    public Snapshot snapshot() {
        return snapshot(null);
    }

    // 경기 ID는 Hub의 확정 시작 상태에서 전달하며 좌석 모델에 중복 저장하지 않는다.
    public Snapshot snapshot(String gameId) {
        List<Seat> seats = new ArrayList<>();
        for (int index = 0; index < capacity(); index++) {
            seats.add(new Seat(index + 1, users[index], ready[index]));
        }
        int minimum = game == null ? 2 : game.minimumPlayers();
        boolean allReady = game != null && betAmountPerPlayer != null && arrivalOrder.size() >= minimum
                && seats.stream().filter(seat -> seat.userId() != null).allMatch(Seat::ready);
        return new Snapshot(tableId, version, capacity(), minimum, List.copyOf(seats), allReady,
                arrivalOrder.isEmpty() ? null : arrivalOrder.getFirst(), game == null ? null : game.name(),
                targetScore, betAmountPerPlayer, gameId);
    }

    private int capacity() {
        return game == null ? users.length : game.maximumPlayers();
    }

    public void returnToWaiting(Set<String> connectedUsers) {
        for (int index = 0; index < users.length; index++) {
            if (users[index] != null && !connectedUsers.contains(users[index])) {
                users[index] = null;
            }
        }
        arrivalOrder.retainAll(connectedUsers);
        if (arrivalOrder.isEmpty()) {
            game = null;
            targetScore = null;
            betAmountPerPlayer = null;
        }
        membershipChanged();
    }

    private int indexOf(String userId) {
        for (int index = 0; index < users.length; index++) {
            if (userId.equals(users[index])) {
                return index;
            }
        }
        throw new IllegalStateException("착석 인덱스 불일치");
    }

    private void membershipChanged() {
        Arrays.fill(ready, false);
        version++;
        readyResetVersion = version;
    }

    public void resetReady() { membershipChanged(); }

    public void publicStateChanged() {
        version++;
    }

    public record Seat(int seatNumber, String userId, boolean ready) {
    }

    public record Snapshot(String tableId, long version, int capacity, int minimumPlayers,
            List<Seat> seats, boolean allReady, String selectorUserId, String gameCode, Integer targetScore,
            Long betAmountPerPlayer,
            String gameId) {
    }
}
