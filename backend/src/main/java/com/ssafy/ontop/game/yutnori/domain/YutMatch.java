package com.ssafy.ontop.game.yutnori.domain;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.random.RandomGenerator;

/** 서버 전용 순수 규칙. 클라이언트는 던진 결과나 목적지를 지정할 수 없다. */
public final class YutMatch {
    public record Rules(boolean emptyBackEnters, boolean doubleCaptureBonus, boolean backHomeFinish) { }
    public record Roll(int id, String name, int steps, int mask, boolean bonus) { }
    public record ThrowResult(int id, String userId, int team, int mask, String name, int steps,
            boolean bonus, boolean out, long at) { }
    public static final class Player {
        public final long userId;
        public final String nickname;
        public int team;
        public boolean ready;

        public Player(long userId, String nickname, int team) {
            this.userId = userId;
            this.nickname = nickname;
            this.team = team;
        }
    }

    public final String id;
    public final String channel;
    public final String name;
    public final long host;
    public final Rules rules;
    public final int teamCount;
    public final int pieceCount;
    public final List<Integer> eliminatedTeams = new ArrayList<>();
    public final Map<Long, Player> players = new LinkedHashMap<>();
    public final List<Roll> rolls = new ArrayList<>();
    public final List<String> log = new ArrayList<>();
    public final YutChat chat = new YutChat();
    public final List<List<List<Integer>>> pieces = new ArrayList<>();
    public final List<Integer> opening = new ArrayList<>();
    public String phase = "WAITING";
    public String reason = "";
    public String message = "팀을 고르고 준비해 주세요.";
    public long version;
    public long turnUser;
    public long deadline;
    public long touched;
    public int team;
    public int credits;
    public int winner = -1;
    public boolean registered;
    public ThrowResult lastThrow;
    private int serial;
    private final int[] teamTurn;

    public YutMatch(String id, String channel, String name, long host, String nickname, Rules rules, long now) {
        this(id, channel, name, host, nickname, rules, 2, 4, now);
    }

    public YutMatch(String id, String channel, String name, long host, String nickname, Rules rules,
            int teamCount, int pieceCount, long now) {
        require(teamCount >= 2 && teamCount <= 4 && pieceCount >= 1 && pieceCount <= 4,
                "팀은 2~4팀, 팀별 말은 1~4개로 선택해주세요.");
        this.id = id;
        this.channel = channel;
        this.name = name;
        this.host = host;
        this.rules = rules;
        this.teamCount = teamCount;
        this.pieceCount = pieceCount;
        teamTurn = new int[teamCount];
        players.put(host, new Player(host, nickname, 0));
        for (int side = 0; side < teamCount; side++) {
            List<List<Integer>> tokens = new ArrayList<>();
            for (int index = 0; index < pieceCount; index++) {
                tokens.add(new ArrayList<>());
            }
            pieces.add(tokens);
        }
        touched = now;
    }

    public void join(long user, String nickname) {
        if (players.containsKey(user)) {
            return;
        }
        require(phase.equals("WAITING") && players.size() < 4, "참가할 수 없는 방이에요.");
        int smallest = 0;
        for (int side = 1; side < teamCount; side++) {
            if (teamPlayers(side).size() < teamPlayers(smallest).size()) {
                smallest = side;
            }
        }
        players.put(user, new Player(user, nickname, smallest));
        players.values().forEach(player -> player.ready = false);
        version++;
    }

    public void act(long user, JsonNode input, RandomGenerator random, long now) {
        Player player = players.get(user);
        require(player != null, "참가자를 확인해주세요.");
        String type = input.path("type").asText();
        if (phase.equals("WAITING")) {
            switch (type) {
                case "TEAM" -> {
                    require(input.path("team").isIntegralNumber(), "팀을 선택해주세요.");
                    int selected = input.path("team").asInt(-1);
                    require(selected >= 0 && selected < teamCount, "팀을 선택해주세요.");
                    player.team = selected;
                    players.values().forEach(member -> member.ready = false);
                }
                case "READY" -> {
                    require(input.path("ready").isBoolean(), "준비 상태를 확인해주세요.");
                    player.ready = input.path("ready").asBoolean();
                }
                default -> throw new IllegalArgumentException("대기 중에는 팀과 준비를 선택해주세요.");
            }
        } else {
            require(phase.equals("PLAYING") && turnUser == user && !eliminatedTeams.contains(player.team),
                    "현재 차례를 확인해주세요.");
            if (type.equals("THROW")) {
                require(credits > 0 && rolls.size() < 32, "먼저 이동권을 사용해주세요.");
                credits--;
                int mask = random.nextInt(16);
                Roll rolled = roll(++serial, mask);
                boolean out = random.nextInt(100) < 2;
                // 이동권이 사라지는 낙·빈 판 빽도도 동일한 확정 결과로 연출·복구한다.
                lastThrow = new ThrowResult(rolled.id(), Long.toString(user), team, mask,
                        out ? "낙" : rolled.name(), out ? 0 : rolled.steps(), !out && rolled.bonus(), out, now);
                if (out) {
                    rolls.clear();
                    credits = 0;
                    note("낙! 윷이 멍석 밖으로 나가 차례를 넘겨요.");
                } else {
                    rolls.add(rolled);
                    if (rolled.bonus()) {
                        credits++;
                    }
                    note(label(team) + " " + rolled.name() + (rolled.bonus() ? "! 한 번 더 던져요." : "! 말을 골라주세요."));
                }
            } else if (type.equals("MOVE")) {
                require(input.path("piece").isIntegralNumber() && input.path("rollId").isIntegralNumber()
                        && input.path("shortcut").isBoolean(), "이동할 말과 이동권을 선택해주세요.");
                int piece = input.path("piece").asInt(-1);
                Roll rolled = rolls.stream().filter(roll -> roll.id() == input.path("rollId").asInt())
                        .findFirst().orElseThrow(() -> new IllegalArgumentException("이동권을 다시 선택해주세요."));
                move(piece, rolled, input.path("shortcut").asBoolean());
            } else {
                throw new IllegalArgumentException("지금 할 수 없는 행동이에요.");
            }
            discardUnusableBack();
            if (pieces.get(team).stream().allMatch(history -> position(history) == YutBoard.FINISHED)) {
                finish(team, "YUT_COMPLETED");
            } else if (credits == 0 && rolls.isEmpty()) {
                advance(now);
            }
        }
        touched = now;
        version++;
    }

    public void start(RandomGenerator random, long now) {
        require(phase.equals("WAITING") && players.size() >= 2 && players.values().stream().allMatch(player -> player.ready)
                && players.values().stream().map(player -> player.team).distinct().count() == teamCount,
                "선택한 모든 팀에 한 명 이상 참가하고 준비해야 시작할 수 있어요.");
        // 두 개 모두 엎어짐(0) > 모두 젖혀짐(3) > 엇갈림. 동률은 재던지기한다.
        int best;
        int winners;
        do {
            opening.clear();
            best = -1;
            winners = 0;
            for (int side = 0; side < teamCount; side++) {
                int mask = random.nextInt(4);
                opening.add(mask);
                if (rank(mask) > best) {
                    best = rank(mask);
                    team = side;
                    winners = 1;
                } else if (rank(mask) == best) {
                    winners++;
                }
            }
        } while (winners != 1);
        phase = "PLAYING";
        credits = 1;
        turnUser = teamPlayers(team).getFirst();
        deadline = now + 90_000;
        note("대표 윷 2개 던지기 · " + label(team) + " 선공이에요.");
        touched = now;
        version++;
    }

    private void move(int index, Roll rolled, boolean shortcut) {
        require(index >= 0 && index < pieceCount, "말을 선택해주세요.");
        List<Integer> history = pieces.get(team).get(index);
        int from = position(history);
        require(from != YutBoard.FINISHED, "이미 완주한 말이에요.");
        List<Integer> target = target(history, rolled, shortcut);
        int to = position(target);
        // 대기석의 말은 한 개씩 출발하며 판 위에 업힌 말은 같은 이동 이력을 공유한다.
        for (int token = 0; token < pieceCount; token++) {
            if (token == index || from > 0 && position(pieces.get(team).get(token)) == from) {
                pieces.get(team).set(token, new ArrayList<>(target));
            }
        }
        boolean caught = false;
        if (to != YutBoard.FINISHED) {
            for (int side = 0; side < teamCount; side++) {
                if (side == team || eliminatedTeams.contains(side)) {
                    continue;
                }
                for (int token = 0; token < pieceCount; token++) {
                    if (position(pieces.get(side).get(token)) == to) {
                        pieces.get(side).set(token, new ArrayList<>());
                        caught = true;
                    }
                }
            }
            for (int token = 0; token < pieceCount; token++) {
                if (position(pieces.get(team).get(token)) == to) {
                    pieces.get(team).set(token, new ArrayList<>(target));
                }
            }
        }
        rolls.remove(rolled);
        if (caught && (!rolled.bonus() || rules.doubleCaptureBonus())) {
            credits++;
        }
        note(label(team) + " " + rolled.name() + " 이동" + (caught ? " · 잡기!" : "")
                + (to == YutBoard.FINISHED ? " · 완주!" : ""));
    }

    private List<Integer> target(List<Integer> history, Roll rolled, boolean shortcut) {
        int from = position(history);
        List<Integer> target;
        if (rolled.steps() == -1 && from == 0) {
            require(rules.emptyBackEnters() && pieces.get(team).stream().noneMatch(YutMatch::onBoard),
                    "빽도는 판 위의 말을 뒤로 옮겨요.");
            target = new ArrayList<>(List.of(1));
        } else {
            require(!shortcut || from == 5 || from == 10 || from == 23, "모서리나 중앙에 멈췄을 때 꺾을 수 있어요.");
            target = YutBoard.move(history, rolled.steps(), shortcut, rules.backHomeFinish());
        }
        return target;
    }

    public record LegalMove(int piece, int rollId, boolean shortcut, int to) { }

    public List<LegalMove> legalMoves() {
        List<LegalMove> result = new ArrayList<>();
        if (!phase.equals("PLAYING")) {
            return result;
        }
        for (int index = 0; index < pieceCount; index++) {
            var history = pieces.get(team).get(index);
            if (position(history) == YutBoard.FINISHED) {
                continue;
            }
            for (Roll rolled : rolls) {
                for (boolean shortcut : List.of(false, true)) {
                    int from = position(history);
                    boolean canEnterBack = rules.emptyBackEnters()
                            && pieces.get(team).stream().noneMatch(YutMatch::onBoard);
                    if (rolled.steps() == -1 && from == 0 && !canEnterBack
                            || shortcut && (rolled.steps() == -1 || from != 5 && from != 10 && from != 23)) {
                        continue;
                    }
                    int to = position(target(history, rolled, shortcut));
                    result.add(new LegalMove(index, rolled.id(), shortcut, to));
                }
            }
        }
        return result;
    }

    private void discardUnusableBack() {
        if (!rules.emptyBackEnters() && pieces.get(team).stream().noneMatch(YutMatch::onBoard)) {
            boolean removed = rolls.removeIf(roll -> roll.steps() == -1);
            if (removed) {
                note("판 위에 말이 없어 빽도는 무효예요.");
            }
        }
    }

    public void advance(long now) {
        rolls.clear();
        teamTurn[team]++;
        do {
            team = (team + 1) % teamCount;
        } while (eliminatedTeams.contains(team));
        List<Long> members = teamPlayers(team);
        turnUser = members.get(teamTurn[team] % members.size());
        credits = 1;
        deadline = now + 90_000;
    }

    public void finish(int winningTeam, String endReason) {
        if (phase.equals("FINISHED")) {
            return;
        }
        winner = winningTeam;
        reason = endReason;
        phase = "FINISHED";
        credits = 0;
        rolls.clear();
        note(winningTeam < 0 ? "경기가 종료되었어요." : label(winningTeam) + " 승리!");
    }

    /** 기권·접속 만료·차례 만료는 해당 팀만 탈락시키고 남은 팀은 계속 진행한다. */
    public void eliminate(int side, String endReason, long now) {
        if (!phase.equals("PLAYING") || eliminatedTeams.contains(side)) {
            return;
        }
        eliminatedTeams.add(side);
        for (int token = 0; token < pieceCount; token++) {
            pieces.get(side).set(token, new ArrayList<>());
        }
        note(label(side) + " 탈락 · " + (endReason.equals("YUT_FORFEIT") ? "기권" : "시간 초과"));
        if (eliminatedTeams.size() == teamCount - 1) {
            for (int remaining = 0; remaining < teamCount; remaining++) {
                if (!eliminatedTeams.contains(remaining)) {
                    finish(remaining, endReason);
                    break;
                }
            }
        } else if (team == side) {
            advance(now);
        }
        touched = now;
        version++;
    }

    public void note(String value) {
        message = value;
        log.add(value);
        if (log.size() > 20) {
            log.removeFirst();
        }
    }

    public List<Long> teamPlayers(int side) {
        return players.values().stream().filter(player -> player.team == side).map(player -> player.userId).toList();
    }

    public static Roll roll(int id, int mask) {
        int count = Integer.bitCount(mask);
        int steps = count == 0 ? 5 : mask == 1 ? -1 : count;
        String name = switch (steps) {
            case -1 -> "빽도";
            case 1 -> "도";
            case 2 -> "개";
            case 3 -> "걸";
            case 4 -> "윷";
            default -> "모";
        };
        return new Roll(id, name, steps, mask, steps >= 4);
    }

    public static int position(List<Integer> history) {
        return history.isEmpty() ? 0 : history.getLast();
    }

    private static boolean onBoard(List<Integer> history) {
        return position(history) > 0 && position(history) < YutBoard.FINISHED;
    }

    public static String label(int side) {
        return switch (side) {
            case 0 -> "청팀";
            case 1 -> "홍팀";
            case 2 -> "녹팀";
            case 3 -> "황팀";
            default -> throw new IllegalArgumentException("팀을 확인해주세요.");
        };
    }

    private static int rank(int mask) {
        return mask == 0 ? 2 : mask == 3 ? 1 : 0;
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }
}
