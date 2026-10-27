package com.ssafy.ontop.admin.analytics;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 백업본에서 계산한 익명 집계만 전달한다. 원본 이벤트·회원·좌표 필드는 없다. */
public record AnalyticsSnapshot(int schemaVersion, String dataAsOf, String generatedAt,
        List<Daily> daily, List<Funnel> funnel, List<Game> games) {
    private static final int MAX_ROWS = 10_000;

    public AnalyticsSnapshot {
        if (schemaVersion != 1 || dataAsOf == null || generatedAt == null
                || daily == null || funnel == null || games == null) {
            throw new IllegalArgumentException("집계 파일 형식을 확인하세요.");
        }
        Instant.parse(dataAsOf);
        Instant.parse(generatedAt);
        daily = List.copyOf(daily);
        funnel = List.copyOf(funnel);
        games = List.copyOf(games);
        if (daily.size() > MAX_ROWS || funnel.size() > MAX_ROWS || games.size() > MAX_ROWS) {
            throw new IllegalArgumentException("집계 행 수를 확인하세요.");
        }
        uniqueDates(daily.stream().map(Daily::date).toList());
        uniqueDates(funnel.stream().map(Funnel::date).toList());
        Set<String> gameKeys = new HashSet<>();
        for (Game row : games) {
            if (!gameKeys.add(row.date() + ":" + row.gameCode())) {
                throw new IllegalArgumentException("중복된 게임 집계가 있습니다.");
            }
        }
    }

    private static void uniqueDates(List<String> dates) {
        if (new HashSet<>(dates).size() != dates.size()) {
            throw new IllegalArgumentException("중복된 일별 집계가 있습니다.");
        }
    }

    private static void validateDate(String value) {
        if (value == null || value.length() != 10 || !LocalDate.parse(value).toString().equals(value)) {
            throw new IllegalArgumentException("집계 날짜를 확인하세요.");
        }
    }

    private static void nonnegative(long... values) {
        for (long value : values) {
            if (value < 0) throw new IllegalArgumentException("집계 숫자를 확인하세요.");
        }
    }

    public record Daily(String date, long activeUsers, long newUsers, long connections, long players) {
        public Daily {
            validateDate(date);
            nonnegative(activeUsers, newUsers, connections, players);
        }
    }

    public record Funnel(String date, long onboarded, long channelJoined, long tableJoined,
            long gameStarted, long gameCompleted) {
        public Funnel {
            validateDate(date);
            nonnegative(onboarded, channelJoined, tableJoined, gameStarted, gameCompleted);
        }
    }

    public record Game(String date, String gameCode, long started, long ended, long completed,
            long forfeits, long participants, long durationSeconds, long timedGames) {
        public Game {
            validateDate(date);
            if (gameCode == null || !gameCode.matches("[A-Z][A-Z0-9_]{0,31}")) {
                throw new IllegalArgumentException("게임 코드를 확인하세요.");
            }
            nonnegative(started, ended, completed, forfeits, participants, durationSeconds, timedGames);
        }
    }
}
