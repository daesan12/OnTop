package com.ssafy.ontop.game.bridge.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.IntSupplier;

// 소유 엔진의 경기 잠금 안에서만 사용한다. 실제 눈은 Snapshot에 포함하지 않는다.
public final class BridgeMatch {
    private final String gameId;
    private final String tableId;
    private final List<Long> players;
    private final Map<Long,List<Pawn>> pawns = new LinkedHashMap<>();
    private final Set<Long> forfeited = new HashSet<>();
    private final Set<Long> pending = new HashSet<>();
    private final List<Slot> slots = new ArrayList<>();
    private final List<Long> judges = new ArrayList<>();
    private final List<Long> acceptedBy = new ArrayList<>();
    private final Map<Key,Accepted> accepted = new HashMap<>();
    private final IntSupplier randomFace;
    private long version;
    private long turnId = 1;
    private int turn;
    private int judgeIndex;
    private int nextGoalSlot = 1;
    private Integer face; // 1..4 또는 0(X). 공개 Snapshot 밖의 비밀 값.
    private Integer declaration;
    private String stage = "AWAITING_ROLL";
    private String lastEvent = "START";
    private Instant deadline;
    private Instant endedAt;
    private String endReason;
    private List<Long> winners = List.of();
    private Resolution resolution;
    private List<Operation> operations = new ArrayList<>();

    public BridgeMatch(String gameId,String tableId,List<Long> players,int first,Instant now,IntSupplier randomFace) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || players == null || players.size() < 2 || players.size() > 4
                || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.stream().distinct().count() != players.size() || first < 0 || first >= players.size()
                || now == null || randomFace == null) {
            throw new IllegalArgumentException("다리 경기와2~4명 참가자를 확인해주세요.");
        }
        this.gameId=gameId; this.tableId=tableId; this.players=List.copyOf(players); this.randomFace=randomFace;
        turn=first;
        int id=0;
        for (long user : players) {
            var list=new ArrayList<Pawn>();
            for (int i=0;i<7;i++) { list.add(new Pawn(++id,i==0 ? "ACTIVE" : "RESERVE")); }
            pawns.put(user,list);
        }
        for (int i=1;i<=8;i++) { slots.add(new Slot(i)); }
        deadline=now.plusSeconds(30);
    }

    public GameActionResult apply(GameActionCommand command,Instant now) {
        if (!gameId.equals(command.gameId()) || !isPlayer(command.userId())) { throw new Rejected(Rejection.ACCESS_DENIED); }
        expire(now);
        Key key=new Key(command.userId(),command.actionId());
        Accepted prior=accepted.get(key);
        if (prior != null) {
            if (prior.expectedVersion()!=command.expectedVersion() || !prior.input().equals(command.input())) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return prior.result();
        }
        if (endedAt != null || forfeited.contains(command.userId()) || pending.contains(command.userId())) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        if (command.expectedVersion()!=version) { throw new Rejected(Rejection.STALE_VERSION); }
        JsonNode input=command.input();
        if (!input.isObject() || !input.path("kind").isTextual()) { throw new Rejected(Rejection.INVALID_ACTION); }
        String kind=input.path("kind").asText();
        Set<String> fields=new HashSet<>(); input.fieldNames().forEachRemaining(fields::add);
        if (!fields.equals(kind.equals("declare") ? Set.of("kind","value") : Set.of("kind"))) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        boolean judging=kind.equals("trust") || kind.equals("doubt");
        if (!List.of("roll","declare","trust","doubt").contains(kind)
                || (judging && !stage.equals("RESPONDING"))
                || (kind.equals("roll") && !stage.equals("AWAITING_ROLL"))
                || (kind.equals("declare") && !stage.equals("DECLARING"))) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        long actor=judging ? judges.get(judgeIndex) : players.get(turn);
        if (actor!=command.userId()) { throw new Rejected(Rejection.NOT_YOUR_TURN); }
        if (kind.equals("declare") && (!input.path("value").isIntegralNumber()
                || !input.path("value").canConvertToInt() || input.path("value").asInt()<1 || input.path("value").asInt()>4)) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        operations=new ArrayList<>();
        switch (kind) {
            case "roll" -> {
                int rolled=randomFace.getAsInt();
                if (rolled<0 || rolled>4) { throw new IllegalStateException("서버 주사위 범위 오류"); }
                face=rolled; stage="DECLARING"; deadline=now.plusSeconds(30); lastEvent="ROLL";
            }
            case "declare" -> {
                declaration=input.path("value").asInt(); judges.clear(); acceptedBy.clear(); judgeIndex=0;
                for (int i=1;i<players.size();i++) {
                    long user=players.get((turn+i)%players.size());
                    if (canJudge(user)) { judges.add(user); }
                }
                lastEvent="DECLARE"; stage="RESPONDING"; deadline=now.plusSeconds(30);
                if (judges.isEmpty()) { resolve(null,now); }
            }
            case "trust" -> trust(now,false);
            case "doubt" -> resolve(actor,now);
            default -> throw new Rejected(Rejection.INVALID_ACTION);
        }
        version++;
        var result=new GameActionResult(command.userId(),gameId,command.actionId(),version);
        accepted.put(key,new Accepted(command.expectedVersion(),input.deepCopy(),result));
        return result;
    }

    private void trust(Instant at,boolean automatic) {
        acceptedBy.add(judges.get(judgeIndex)); judgeIndex++;
        while (judgeIndex<judges.size() && !canJudge(judges.get(judgeIndex))) { judgeIndex++; }
        lastEvent=automatic ? "JUDGE_TIMEOUT" : "TRUST";
        if (judgeIndex>=judges.size()) { resolve(null,at); }
        else { deadline=at.plusSeconds(30); }
    }

    private void resolve(Long challenger,Instant at) {
        long declarer=players.get(turn);
        boolean bluff=challenger!=null && !face.equals(declaration);
        if (challenger==null) { advance(declarer,declaration); lastEvent="ALL_TRUSTED"; }
        else if (bluff) { fall(declarer); advance(challenger,declaration); lastEvent="DOUBT_SUCCESS"; }
        else { fall(challenger); advance(declarer,declaration); lastEvent="DOUBT_FAILED"; }
        Integer revealed=challenger==null ? null : face;
        face=null;
        applyPending();
        evaluate(at);
        if (endedAt==null) {
            replenish(); stage="RESOLVING"; deadline=at.plusMillis(1500);
        }
        resolution=new Resolution(turnId,declarer,declaration,challenger!=null,revealed,challenger,
                challenger==null ? null : bluff,at,List.copyOf(operations));
    }

    private void advance(long user,int steps) {
        Pawn pawn=active(user);
        if (pawn==null) { return; } // 골인 말만 가진 도전자에게 새 말을 만들어 보상하지 않는다.
        int from=pawn.position;
        pawn.position=Math.min(9,pawn.position+steps);
        operations.add(new Operation("MOVE_PAWN",user,pawn.id,from,pawn.position,null,null));
        if (pawn.position==9) {
            if (nextGoalSlot>8 || !slots.get(nextGoalSlot-1).status.equals("UNUSED")) {
                throw new IllegalStateException("골인 슬롯 불변식 오류");
            }
            Slot slot=slots.get(nextGoalSlot-1);
            slot.status="OCCUPIED"; slot.user=user; slot.pawn=pawn.id; slot.assignedTurn=turnId;
            pawn.status="SCORED"; pawn.goalSlot=nextGoalSlot++;
            operations.add(new Operation("SCORE_PAWN",user,pawn.id,null,9,pawn.goalSlot,null));
        }
    }

    private void fall(long user) {
        Pawn pawn=active(user);
        if (pawn!=null) {
            pawn.status="FALLEN";
            operations.add(new Operation("FALL_PAWN",user,pawn.id,pawn.position,null,null,null));
        } else {
            slots.stream().filter(s -> s.status.equals("OCCUPIED") && s.user.equals(user)).findFirst()
                    .ifPresent(slot -> vacate(slot,"FAILED_DOUBT"));
        }
    }

    private void vacate(Slot slot,String reason) {
        Pawn pawn=pawns.get(slot.user).stream().filter(p -> p.id==slot.pawn).findFirst().orElseThrow();
        pawn.status="REMOVED_SCORED";
        operations.add(new Operation("VACATE_GOAL_SLOT",slot.user,pawn.id,null,null,slot.number,reason));
        slot.status="VACATED"; slot.user=null; slot.pawn=null; slot.removedReason=reason;
    }

    private void replenish() {
        for (long user : players) {
            if (forfeited.contains(user) || active(user)!=null) { continue; }
            pawns.get(user).stream().filter(p -> p.status.equals("RESERVE")).findFirst().ifPresent(p -> {
                p.status="ACTIVE"; p.position=0;
                operations.add(new Operation("SPAWN_PAWN",user,p.id,null,0,null,null));
            });
        }
    }

    public void expire(Instant now) {
        while (endedAt==null && !now.isBefore(deadline)) {
            Instant at=deadline;
            operations=new ArrayList<>();
            if (stage.equals("RESPONDING")) { trust(at,true); version++; }
            else if (stage.equals("RESOLVING")) { nextTurn(at); version++; }
            else {
                // 사용자 정책: 자동 굴림/선언 대신 해당 차례를 넘긴다. 비밀 값은 폐기한다.
                face=null; declaration=null; lastEvent="TURN_TIMEOUT";
                applyPending(); evaluate(at);
                if (endedAt==null) { nextTurn(at); }
                version++;
                // 입력 없이 수십 일 경과해도 차례 넘김을 반복 순회하지 않는다.
                if (endedAt==null && !now.isBefore(deadline)) {
                    List<Integer> eligible=new ArrayList<>();
                    for (int i=0;i<players.size();i++) { if (runnable(players.get(i))) { eligible.add(i); } }
                    long count=Duration.between(deadline,now).getSeconds()/30+1;
                    int index=eligible.indexOf(turn);
                    turn=eligible.get((int)((index+count%eligible.size())%eligible.size()));
                    turnId+=count; version+=count; deadline=deadline.plusSeconds(Math.multiplyExact(count,30));
                }
            }
        }
    }

    private void nextTurn(Instant at) {
        for (int i=1;i<=players.size();i++) {
            int candidate=(turn+i)%players.size();
            if (runnable(players.get(candidate))) {
                turn=candidate; turnId++; stage="AWAITING_ROLL"; deadline=at.plusSeconds(30);
                declaration=null; face=null; judges.clear(); acceptedBy.clear(); judgeIndex=0;
                return;
            }
        }
        evaluate(at);
    }

    public void forfeit(long user,Instant at) {
        if (!isPlayer(user) || endedAt!=null || forfeited.contains(user) || pending.contains(user)) { return; }
        operations=new ArrayList<>();
        pending.add(user); lastEvent="PLAYER_LEFT"; version++;
        if (stage.equals("DECLARING") || stage.equals("RESPONDING")) {
            if (stage.equals("RESPONDING") && judges.get(judgeIndex)==user) { trust(at,true); }
            return;
        }
        applyPending(); evaluate(at);
        if (endedAt==null && !runnable(players.get(turn)) && stage.equals("AWAITING_ROLL")) { nextTurn(at); }
    }

    private void applyPending() {
        for (long user : players) {
            if (!pending.remove(user)) { continue; }
            forfeited.add(user);
            for (Pawn pawn : pawns.get(user)) {
                if (pawn.status.equals("SCORED")) { vacate(slots.get(pawn.goalSlot-1),"FORFEIT"); }
                else if (pawn.status.equals("ACTIVE") || pawn.status.equals("RESERVE")) { pawn.status="FORFEITED"; }
            }
            operations.add(new Operation("FORFEIT_PLAYER",user,null,null,null,null,null));
        }
    }

    private void evaluate(Instant at) {
        List<Long> live=players.stream().filter(u -> !forfeited.contains(u)).toList();
        List<Long> three=live.stream().filter(u -> scored(u)>=3).toList();
        if (!three.isEmpty()) { finish(three,"THREE_GOALS",at); }
        else if (live.size()==1) { finish(live,"LAST_PLAYER_STANDING",at); }
        else if (live.isEmpty()) { finish(live,"ABORTED_NO_PLAYERS",at); }
        else if (nextGoalSlot>8 || live.stream().noneMatch(this::runnable)) {
            int best=live.stream().mapToInt(this::score).max().orElse(0);
            finish(live.stream().filter(u -> score(u)==best).toList(),
                    nextGoalSlot>8 ? "GOAL_SLOTS_EXHAUSTED" : "NO_RUNNABLE_PAWNS",at);
        }
    }

    private void finish(List<Long> users,String reason,Instant at) {
        winners=List.copyOf(users); endReason=reason; endedAt=at; stage="FINISHED"; deadline=null; face=null;
    }

    private Pawn active(long user) { return pawns.get(user).stream().filter(p -> p.status.equals("ACTIVE")).findFirst().orElse(null); }
    private int scored(long user) { return (int)pawns.get(user).stream().filter(p -> p.status.equals("SCORED")).count(); }
    private int score(long user) { return slots.stream().filter(s -> s.status.equals("OCCUPIED") && s.user.equals(user)).mapToInt(s -> s.number).sum(); }
    private boolean runnable(long user) { return !forfeited.contains(user) && pawns.get(user).stream().anyMatch(p -> p.status.equals("ACTIVE") || p.status.equals("RESERVE")); }
    private boolean canJudge(long user) { return !forfeited.contains(user) && !pending.contains(user) && (active(user)!=null || scored(user)>0); }
    public boolean isPlayer(long user) { return pawns.containsKey(user); }
    public boolean isActive(long user) { return isPlayer(user) && !forfeited.contains(user) && !pending.contains(user); }
    public Integer privateFace(long user) {
        return endedAt==null && players.get(turn)==user && !pending.contains(user)
                && (stage.equals("DECLARING") || stage.equals("RESPONDING")) ? face : null;
    }

    public Snapshot snapshot() {
        var publicPlayers=new ArrayList<PlayerView>();
        for (long user : players) {
            publicPlayers.add(new PlayerView(user,score(user),scored(user),forfeited.contains(user),pending.contains(user),
                    pawns.get(user).stream().map(p -> new PawnView(p.id,p.status,p.position,p.goalSlot)).toList()));
        }
        return new Snapshot(gameId,tableId,players,version,turnId,stage,endedAt==null ? players.get(turn) : null,
                stage.equals("RESPONDING") ? judges.get(judgeIndex) : null,deadline,declaration,
                List.copyOf(judges),List.copyOf(acceptedBy),List.copyOf(publicPlayers),
                slots.stream().map(s -> new SlotView(s.number,s.status,s.user,s.pawn,s.removedReason,s.assignedTurn)).toList(),
                nextGoalSlot,resolution,List.copyOf(operations),lastEvent,winners,endReason,endedAt);
    }

    private static final class Pawn {
        final int id; String status; int position; Integer goalSlot;
        Pawn(int id,String status) { this.id=id; this.status=status; }
    }
    private static final class Slot {
        final int number; String status="UNUSED"; Long user; Integer pawn; String removedReason; Long assignedTurn;
        Slot(int number) { this.number=number; }
    }
    private record Key(long user,String id) { }
    private record Accepted(long expectedVersion,JsonNode input,GameActionResult result) { }
    public record PawnView(int id,String status,int position,Integer goalSlot) { }
    public record SlotView(int slot,String status,Long userId,Integer pawnId,String removedReason,Long firstAssignedTurnId) { }
    public record PlayerView(long userId,int score,int goals,boolean forfeited,boolean pendingForfeit,List<PawnView> pawns) { }
    public record Operation(String type,long userId,Integer pawnId,Integer fromPosition,Integer toPosition,Integer slotNumber,String reason) { }
    public record Resolution(long turnId,long declarerUserId,int declaredNumber,boolean challenged,Integer actualFace,
            Long challengerUserId,Boolean wasBluff,Instant startedAt,List<Operation> operations) { }
    public record Snapshot(String gameId,String tableId,List<Long> players,long version,long turnId,String stage,Long turnUserId,
            Long responderUserId,Instant turnDeadline,Integer declaration,List<Long> responseOrder,List<Long> acceptedBy,
            List<PlayerView> publicPlayers,List<SlotView> goalSlots,int nextGoalSlot,Resolution resolution,List<Operation> operations,
            String lastEvent,List<Long> winnerUserIds,String endReason,Instant endedAt) { }
}
