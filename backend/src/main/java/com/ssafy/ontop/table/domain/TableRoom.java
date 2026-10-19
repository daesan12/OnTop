package com.ssafy.ontop.table.domain;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

// TableHub의 상태 잠금 안에서만 접근한다. 연결 객체나 DB 엔티티를 보관하지 않는다.
public final class TableRoom {

    private final String tableId;
    private final String[] users = new String[2];
    private final boolean[] ready = new boolean[2];
    private long version;

    public TableRoom(String tableId) {
        this.tableId = tableId;
    }

    public boolean join(String userId) {
        for (int index = 0; index < users.length; index++) {
            if (users[index] == null) {
                users[index] = userId;
                membershipChanged();
                return true;
            }
        }
        return false;
    }

    public void leave(String userId) {
        users[indexOf(userId)] = null;
        membershipChanged();
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

    public Snapshot snapshot() {
        List<Seat> seats = new ArrayList<>();
        for (int index = 0; index < users.length; index++) {
            seats.add(new Seat(index + 1, users[index], ready[index]));
        }
        boolean allReady = seats.stream().allMatch(seat -> seat.userId() != null && seat.ready());
        return new Snapshot(tableId, version, 2, 2, List.copyOf(seats), allReady);
    }

    public void returnToWaiting(Set<String> connectedUsers) {
        for (int index = 0; index < users.length; index++) {
            if (users[index] != null && !connectedUsers.contains(users[index])) {
                users[index] = null;
            }
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
    }

    public record Seat(int seatNumber, String userId, boolean ready) {
    }

    public record Snapshot(String tableId, long version, int capacity, int minimumPlayers,
            List<Seat> seats, boolean allReady) {
    }
}
