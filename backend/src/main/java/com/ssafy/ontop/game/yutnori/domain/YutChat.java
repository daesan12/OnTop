package com.ssafy.ontop.game.yutnori.domain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 공개 대화와 팀 대화는 저장소부터 분리하여 공개 상태로 섞이지 않게 한다. */
public final class YutChat {
    public enum Scope { ALL, TEAM }
    public record Message(long id, Scope scope, int team, String userId, String nickname, String text, long sentAt) { }

    private final List<Message> everyone = new ArrayList<>();
    private final Map<Integer, List<Message>> teams = new HashMap<>();
    private long serial;

    public void append(long user, String nickname, Scope scope, int team, String text, long now) {
        var message = new Message(++serial, scope, scope == Scope.TEAM ? team : -1,
                Long.toString(user), nickname, text, now);
        List<Message> target = scope == Scope.ALL ? everyone : teams.computeIfAbsent(team, ignored -> new ArrayList<>());
        target.add(message);
        int limit = scope == Scope.ALL ? 60 : 40;
        if (target.size() > limit) {
            target.removeFirst();
        }
    }

    public List<Message> everyone() {
        return List.copyOf(everyone);
    }

    public List<Message> team(int team) {
        return List.copyOf(teams.getOrDefault(team, List.of()));
    }
}
