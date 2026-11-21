package com.ssafy.ontop.game.bang.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.function.Consumer;

import static com.ssafy.ontop.game.bang.domain.BangCard.Kind;

/** 엔진 잠금 안의 순수 경기 상태. 공용 지갑·소켓·DB에는 접근하지 않는다. */
public final class BangMatch {
    public enum Role { SHERIFF, DEPUTY, OUTLAW, RENEGADE }

    private final String gameId;
    private final String tableId;
    private final ObjectMapper mapper;
    private final Random random;
    private final List<Player> players = new ArrayList<>();
    private final List<BangCard> deck;
    private final List<BangCard> discard = new ArrayList<>();
    private final List<BangCard> choices = new ArrayList<>();
    private final List<BangCard> store = new ArrayList<>();
    private final Deque<Runnable> effects = new ArrayDeque<>();
    private final Map<String, Receipt> receipts = new HashMap<>();
    private final List<String> history = new ArrayList<>();
    private List<Long> winners = List.of();
    private Player turn;
    private Player actor;
    private Player damageSource;
    private int pendingDamageAbility;
    private Player duelInitiator;
    private Response response;
    private Consumer<BangCard> judgement;
    private String phase = "RESOLVING";
    private String endReason;
    private String judgementReason;
    private BangCard lastJudgement;
    private Instant endedAt;
    private Instant deadline;
    private Instant now;
    private long version;
    private int shots;
    private int turnNumber;

    public BangMatch(String gameId, String tableId, List<Long> users, ObjectMapper mapper, Random random, Instant now) {
        this(gameId, tableId, users, mapper, random, now, null, null, null);
    }

    // 같은 규칙 엔진을 결정적 카드/역할로 검증하기 위한 패키지 전용 진입점이다.
    BangMatch(String gameId, String tableId, List<Long> users, ObjectMapper mapper, Random random, Instant now,
            List<Role> fixedRoles, List<BangCharacter> fixedCharacters, List<BangCard> fixedDeck) {
        if (users == null || users.size() < 4 || users.size() > 7
                || users.stream().anyMatch(user -> user == null || user <= 0)
                || users.stream().distinct().count() != users.size()) {
            throw new IllegalArgumentException("뱅은 서로 다른 4~7명의 참가자가 필요해요.");
        }
        this.gameId = Objects.requireNonNull(gameId);
        this.tableId = Objects.requireNonNull(tableId);
        this.mapper = mapper;
        this.random = random;
        this.now = now;
        List<Role> roles = new ArrayList<>(fixedRoles == null ? roles(users.size()) : fixedRoles);
        List<BangCharacter> characters = new ArrayList<>(fixedCharacters == null
                ? List.of(BangCharacter.values()) : fixedCharacters);
        deck = new ArrayList<>(fixedDeck == null ? BangCard.deck() : fixedDeck);
        if (fixedRoles == null) { Collections.shuffle(roles, random); }
        if (fixedCharacters == null) { Collections.shuffle(characters, random); }
        if (fixedDeck == null) { Collections.shuffle(deck, random); }
        for (int index = 0; index < users.size(); index++) {
            Player player = new Player(users.get(index), roles.get(index), characters.get(index));
            players.add(player);
            draw(player, player.maxHp);
        }
        turn = players.stream().filter(player -> player.role == Role.SHERIFF).findFirst().orElseThrow();
        startTurn();
        drain();
    }

    public static List<Role> roles(int count) {
        if (count < 4 || count > 7) { throw new IllegalArgumentException("뱅은 4~7인 게임이에요."); }
        List<Role> roles = new ArrayList<>(List.of(Role.SHERIFF, Role.RENEGADE, Role.OUTLAW, Role.OUTLAW));
        if (count >= 5) { roles.add(Role.DEPUTY); }
        if (count >= 6) { roles.add(Role.OUTLAW); }
        if (count == 7) { roles.add(Role.DEPUTY); }
        return List.copyOf(roles);
    }

    public GameActionResult apply(GameActionCommand command, Instant at) {
        Player player = find(command.userId());
        if (player == null) { throw new Rejected(Rejection.ACCESS_DENIED); }
        String key = command.userId() + ":" + command.actionId();
        Receipt previous = receipts.get(key);
        if (previous != null) {
            if (previous.expectedVersion != command.expectedVersion() || !previous.input.equals(command.input())) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return previous.result;
        }
        if (endedAt != null) { throw new Rejected(Rejection.GAME_FINISHED); }
        if (!player.active) { throw new Rejected(Rejection.NOT_ACTIVE); }
        if (command.expectedVersion() != version) { throw new Rejected(Rejection.STALE_VERSION); }
        JsonNode input = command.input();
        boolean sid = input.path("kind").asText().equals("sid_heal") && player.character == BangCharacter.SID_KETCHUM
                && player.hp < player.maxHp && input.size() == 3
                && input.path("cardId").isTextual() && input.path("secondCardId").isTextual()
                && !input.path("cardId").asText().equals(input.path("secondCardId").asText())
                && player.hand.stream().anyMatch(card -> card.id().equals(input.path("cardId").asText()))
                && player.hand.stream().anyMatch(card -> card.id().equals(input.path("secondCardId").asText()));
        if (!sid && (input.path("kind").asText().equals("sid_heal") || actions(player.userId).stream().noneMatch(input::equals))) {
            throw new Rejected(player != actor ? Rejection.NOT_YOUR_TURN : Rejection.INVALID_ACTION);
        }
        Instant previousDeadline = deadline;
        Player previousActor = actor;
        String previousPhase = phase;
        now = at;
        execute(player, input);
        stabilize();
        version++;
        deadline = endedAt == null ? sid && player != previousActor && previousActor == actor && previousPhase.equals(phase)
                ? previousDeadline : at.plusSeconds(phase.equals("PLAY") ? 60 : 20) : null;
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        receipts.put(key, new Receipt(command.expectedVersion(), input.deepCopy(), result));
        return result;
    }

    public void expire(Instant at) {
        if (endedAt != null || deadline == null || at.isBefore(deadline)) { return; }
        now = at;
        if (phase.equals("PLAY")) {
            phase = "DISCARD";
            actor = turn;
        }
        if (phase.equals("DISCARD")) {
            while (turn.hand.size() > turn.hp) { discard.add(turn.hand.removeFirst()); }
            nextTurn();
        } else {
            List<ObjectNode> available = actions(actor.userId);
            ObjectNode fallback = available.stream().filter(action -> List.of("take_hit", "give_up")
                    .contains(action.path("kind").asText())).findFirst().orElse(available.getFirst());
            execute(actor, fallback);
        }
        note("시간이 지나 서버가 차례를 진행했어요.");
        stabilize();
        version++;
        deadline = endedAt == null ? at.plusSeconds(phase.equals("PLAY") ? 60 : 20) : null;
    }

    public boolean forfeit(long userId, Instant at) {
        Player player = find(userId);
        if (endedAt != null || player == null || !player.active) { return false; }
        now = at;
        player.forfeited = true;
        eliminate(player, null);
        if (endedAt == null && player == actor) {
            if (phase.equals("KIT")) { discard.addAll(choices); choices.clear(); }
            if (phase.equals("LUCKY")) {
                discard.addAll(choices);
                choices.clear();
                judgement = null;
            }
            response = null;
            phase = "RESOLVING";
        }
        if (endedAt == null && response != null && (!response.source.active || !response.target.active)) {
            response = null;
            phase = "RESOLVING";
        }
        stabilize();
        version++;
        deadline = endedAt == null ? at.plusSeconds(phase.equals("PLAY") ? 60 : 20) : null;
        return true;
    }

    public List<ObjectNode> actions(long userId) {
        Player player = find(userId);
        List<ObjectNode> actions = new ArrayList<>();
        if (endedAt != null || player == null || !player.active) { return actions; }
        if (player.character == BangCharacter.SID_KETCHUM && player.hp < player.maxHp && player.hand.size() >= 2) {
            actions.add(action("sid_heal"));
        }
        if (player != actor) { return actions; }
        switch (phase) {
            case "RESCUE" -> {
                if (living().size() > 2) {
                    for (BangCard card : player.hand) {
                        if (card.kind() == Kind.BEER) { actions.add(action("rescue").put("cardId", card.id())); }
                    }
                }
                actions.add(action("give_up"));
            }
            case "RESPONSE" -> {
                for (BangCard card : player.hand) {
                    if (response.kind.equals("BANG") ? missed(player, card) : bang(player, card)) {
                        actions.add(action("respond").put("cardId", card.id()));
                    }
                }
                if (response.kind.equals("BANG") && response.barrels > 0) { actions.add(action("barrel")); }
                actions.add(action("take_hit"));
            }
            case "KIT", "LUCKY" -> {
                for (BangCard card : choices) { actions.add(action("choose").put("cardId", card.id())); }
            }
            case "STORE" -> {
                for (BangCard card : store) { actions.add(action("choose").put("cardId", card.id())); }
            }
            case "DRAW" -> {
                actions.add(action("draw"));
                if (player.character == BangCharacter.JESSE_JONES) {
                    for (Player target : living()) {
                        if (target != player && !target.hand.isEmpty()) {
                            actions.add(action("draw").put("targetUserId", Long.toString(target.userId)));
                        }
                    }
                }
                if (player.character == BangCharacter.PEDRO_RAMIREZ && !discard.isEmpty()) {
                    actions.add(action("draw").put("fromDiscard", true));
                }
            }
            case "DISCARD" -> {
                for (BangCard card : player.hand) { actions.add(action("discard").put("cardId", card.id())); }
            }
            case "PLAY" -> {
                actions.add(action("end_turn"));
                for (BangCard card : player.hand) { playOptions(player, card, actions); }
            }
            default -> { }
        }
        return actions;
    }

    private void playOptions(Player player, BangCard card, List<ObjectNode> actions) {
        Kind kind = card.kind();
        if (kind == Kind.MISSED && player.character != BangCharacter.CALAMITY_JANET) { return; }
        if (bang(player, card)) {
            if (shots > 0 && !player.has(Kind.VOLCANIC) && player.character != BangCharacter.WILLY_THE_KID) { return; }
            for (Player target : living()) {
                if (target != player && distance(player.userId, target.userId) <= range(player)) {
                    actions.add(play(card).put("targetUserId", Long.toString(target.userId)));
                }
            }
            return;
        }
        if (kind.equipment() && kind != Kind.JAIL) {
            if (!player.has(kind)) { actions.add(play(card)); }
            return;
        }
        if (List.of(Kind.JAIL, Kind.DUEL, Kind.PANIC, Kind.CAT_BALOU).contains(kind)) {
            for (Player target : living()) {
                if (target == player || kind == Kind.JAIL && (target.role == Role.SHERIFF || target.has(Kind.JAIL))
                        || kind == Kind.PANIC && distance(player.userId, target.userId) > 1) { continue; }
                ObjectNode input = play(card).put("targetUserId", Long.toString(target.userId));
                if (kind == Kind.PANIC || kind == Kind.CAT_BALOU) {
                    if (!target.hand.isEmpty()) { actions.add(input.deepCopy().put("zone", "HAND")); }
                    for (BangCard equipment : target.table) {
                        actions.add(input.deepCopy().put("zone", "TABLE").put("targetCardId", equipment.id()));
                    }
                } else { actions.add(input); }
            }
            return;
        }
        actions.add(play(card));
    }

    private void execute(Player player, JsonNode input) {
        String kind = input.path("kind").asText();
        switch (kind) {
            case "sid_heal" -> {
                discard.add(remove(player.hand, input.path("cardId").asText()));
                discard.add(remove(player.hand, input.path("secondCardId").asText()));
                player.hp = Math.min(player.maxHp, player.hp + 1);
                if (phase.equals("RESCUE") && player == actor && player.hp > 0) { resumeAfterDamage(player); }
            }
            case "end_turn" -> {
                if (player.hand.size() > player.hp) { phase = "DISCARD"; }
                else { nextTurn(); }
            }
            case "discard" -> {
                discard.add(remove(player.hand, input.path("cardId").asText()));
                if (player.hand.size() <= player.hp) { nextTurn(); }
            }
            case "draw" -> {
                Player target = find(input.path("targetUserId").asLong());
                if (target != null) { player.hand.add(target.hand.remove(random.nextInt(target.hand.size()))); }
                else if (input.path("fromDiscard").asBoolean()) { player.hand.add(discard.removeLast()); }
                else { draw(player, 1); }
                draw(player, 1);
                phase = "PLAY";
            }
            case "choose" -> choose(player, input.path("cardId").asText());
            case "play" -> playCard(player, input);
            case "respond" -> {
                discard.add(remove(player.hand, input.path("cardId").asText()));
                if (response.kind.equals("DUEL")) {
                    Player other = response.source;
                    response = new Response(player, other, "DUEL", 1, 0);
                    actor = other;
                } else if (--response.remaining <= 0) {
                    response = null;
                    phase = "RESOLVING";
                }
            }
            case "barrel" -> {
                response.barrels--;
                drawCheck(player, "BARREL", card -> {
                    if (card != null && card.hearts() && --response.remaining <= 0) {
                        response = null;
                        phase = "RESOLVING";
                    } else { phase = "RESPONSE"; actor = player; }
                });
            }
            case "take_hit" -> {
                Player source = response.kind.equals("DUEL") ? duelInitiator : response.source;
                response = null;
                duelInitiator = null;
                phase = "RESOLVING";
                damage(player, source, 1);
            }
            case "rescue" -> {
                discard.add(remove(player.hand, input.path("cardId").asText()));
                player.hp++;
                if (player.hp > 0) { resumeAfterDamage(player); }
            }
            case "give_up" -> {
                eliminate(player, damageSource);
                phase = endedAt == null ? "RESOLVING" : "FINISHED";
            }
            default -> throw new Rejected(Rejection.INVALID_ACTION);
        }
    }

    private void choose(Player player, String cardId) {
        if (phase.equals("KIT")) {
            BangCard returned = remove(choices, cardId);
            player.hand.addAll(choices);
            choices.clear();
            deck.addFirst(returned);
            phase = "PLAY";
        } else if (phase.equals("LUCKY")) {
            BangCard selected = choices.stream().filter(card -> card.id().equals(cardId)).findFirst().orElseThrow();
            discard.addAll(choices);
            choices.clear();
            lastJudgement = selected;
            Consumer<BangCard> callback = judgement;
            judgement = null;
            phase = "RESOLVING";
            callback.accept(selected);
        } else {
            player.hand.add(remove(store, cardId));
            phase = "RESOLVING";
        }
    }

    private void playCard(Player player, JsonNode input) {
        BangCard card = remove(player.hand, input.path("cardId").asText());
        Player target = find(input.path("targetUserId").asLong());
        note(player.userId + " · " + card.kind());
        if (card.kind().equipment()) {
            Player owner = card.kind() == Kind.JAIL ? target : player;
            if (card.kind().range() > 0) {
                List<BangCard> weapons = owner.table.stream().filter(item -> item.kind().range() > 0).toList();
                owner.table.removeAll(weapons);
                discard.addAll(weapons);
            }
            owner.table.add(card);
            return;
        }
        discard.add(card);
        if (bang(player, card)) {
            shots++;
            attack(player, target, "BANG", player.character == BangCharacter.SLAB_THE_KILLER ? 2 : 1);
            return;
        }
        switch (card.kind()) {
            case BEER -> {
                if (living().size() > 2) { player.hp = Math.min(player.maxHp, player.hp + 1); }
            }
            case SALOON -> living().forEach(person -> person.hp = Math.min(person.maxHp, person.hp + 1));
            case STAGECOACH -> draw(player, 2);
            case WELLS_FARGO -> draw(player, 3);
            case DUEL -> {
                duelInitiator = player;
                attack(player, target, "DUEL", 1);
            }
            case INDIANS, GATLING -> {
                phase = "RESOLVING";
                for (Player person : clockwiseAfter(player)) {
                    if (person != player) {
                        effects.addLast(() -> attack(player, person, card.kind() == Kind.GATLING ? "BANG" : "INDIANS", 1));
                    }
                }
            }
            case GENERAL_STORE -> {
                phase = "RESOLVING";
                for (int index = 0; index < living().size(); index++) {
                    BangCard revealed = take();
                    if (revealed != null) { store.add(revealed); }
                }
                List<Player> order = new ArrayList<>(List.of(player));
                order.addAll(clockwiseAfter(player));
                for (Player person : order) {
                    effects.addLast(() -> {
                        if (person.active && !store.isEmpty()) { actor = person; phase = "STORE"; }
                    });
                }
                effects.addLast(() -> { discard.addAll(store); store.clear(); });
            }
            case PANIC, CAT_BALOU -> {
                BangCard taken = input.path("zone").asText().equals("HAND")
                        ? target.hand.remove(random.nextInt(target.hand.size()))
                        : remove(target.table, input.path("targetCardId").asText());
                if (card.kind() == Kind.PANIC) { player.hand.add(taken); }
                else { discard.add(taken); }
            }
            default -> throw new IllegalStateException("처리되지 않은 뱅 카드입니다.");
        }
    }

    private void attack(Player source, Player target, String kind, int required) {
        if (!target.active || endedAt != null) { return; }
        int barrels = kind.equals("BANG") ? (target.has(Kind.BARREL) ? 1 : 0)
                + (target.character == BangCharacter.JOURDONNAIS ? 1 : 0) : 0;
        response = new Response(source, target, kind, required, barrels);
        actor = target;
        phase = "RESPONSE";
    }

    private void startTurn() {
        shots = 0;
        turnNumber++;
        phase = "RESOLVING";
        Player player = turn;
        actor = player;
        effects.addLast(() -> {
            if (!player.active || !player.has(Kind.DYNAMITE)) { return; }
            BangCard dynamite = player.table.stream().filter(card -> card.kind() == Kind.DYNAMITE).findFirst().orElseThrow();
            drawCheck(player, "DYNAMITE", card -> {
                player.table.remove(dynamite);
                if (card != null && card.explodes()) {
                    discard.add(dynamite);
                    damage(player, null, 3);
                } else {
                    Player recipient = clockwiseAfter(player).stream().filter(person -> !person.has(Kind.DYNAMITE))
                            .findFirst().orElse(player);
                    recipient.table.add(dynamite);
                }
            });
        });
        effects.addLast(() -> {
            if (!player.active || !player.has(Kind.JAIL)) { return; }
            BangCard jail = player.table.stream().filter(card -> card.kind() == Kind.JAIL).findFirst().orElseThrow();
            drawCheck(player, "JAIL", card -> {
                player.table.remove(jail);
                discard.add(jail);
                if (card == null || !card.hearts()) {
                    note(player.userId + " · 감옥에서 차례를 쉬어요.");
                    effects.clear();
                    nextTurn();
                }
            });
        });
        effects.addLast(() -> {
            if (!player.active) { nextTurn(); return; }
            actor = player;
            if (player.character == BangCharacter.KIT_CARLSON) {
                for (int index = 0; index < 3; index++) {
                    BangCard card = take();
                    if (card != null) { choices.add(card); }
                }
                if (choices.size() < 3) { player.hand.addAll(choices); choices.clear(); phase = "PLAY"; }
                else { phase = "KIT"; }
            } else if (player.character == BangCharacter.JESSE_JONES || player.character == BangCharacter.PEDRO_RAMIREZ) {
                phase = "DRAW";
            } else {
                draw(player, 1);
                BangCard second = take();
                if (second != null) {
                    player.hand.add(second);
                    if (player.character == BangCharacter.BLACK_JACK) {
                        lastJudgement = second;
                        judgementReason = "BLACK_JACK";
                        if (second.hearts() || second.suit() == BangCard.Suit.DIAMONDS) { draw(player, 1); }
                    }
                }
                phase = "PLAY";
            }
        });
        deadline = now.plusSeconds(60);
    }

    private void drawCheck(Player player, String reason, Consumer<BangCard> callback) {
        judgementReason = reason;
        BangCard first = take();
        if (player.character == BangCharacter.LUCKY_DUKE && first != null) {
            BangCard second = take();
            if (second != null) {
                choices.add(first);
                choices.add(second);
                judgement = callback;
                actor = player;
                phase = "LUCKY";
                return;
            }
        }
        lastJudgement = first;
        if (first != null) { discard.add(first); }
        callback.accept(first);
    }

    private void damage(Player player, Player source, int amount) {
        player.hp -= amount;
        damageSource = source;
        pendingDamageAbility = amount;
        note(player.userId + " · 생명력 " + amount + " 감소");
        if (player.hp <= 0) {
            actor = player;
            phase = "RESCUE";
        } else {
            damageAbility(player);
            phase = "RESOLVING";
        }
    }

    private void damageAbility(Player player) {
        int amount = pendingDamageAbility;
        Player source = damageSource;
        pendingDamageAbility = 0;
        if (player.character == BangCharacter.BART_CASSIDY) { draw(player, amount); }
        if (player.character == BangCharacter.EL_GRINGO && source != null && source != player) {
            for (int index = 0; index < amount && !source.hand.isEmpty(); index++) {
                player.hand.add(source.hand.remove(random.nextInt(source.hand.size())));
            }
        }
    }

    private void resumeAfterDamage(Player player) {
        damageAbility(player);
        phase = "RESOLVING";
        note(player.userId + " · 생존했어요.");
    }

    private void eliminate(Player player, Player source) {
        if (player == actor && phase.equals("RESCUE")) { pendingDamageAbility = 0; }
        player.active = false;
        player.hp = 0;
        List<BangCard> abandoned = new ArrayList<>(player.hand);
        abandoned.addAll(player.table);
        player.hand.clear();
        player.table.clear();
        Player vulture = living().stream().filter(person -> person.character == BangCharacter.VULTURE_SAM)
                .findFirst().orElse(null);
        if (vulture != null) { vulture.hand.addAll(abandoned); }
        else { discard.addAll(abandoned); }
        note(player.userId + " · " + player.role + " 탈락");
        checkWinner();
        if (endedAt != null || source == null || !source.active) { return; }
        if (player.role == Role.OUTLAW) { draw(source, 3); }
        if (source.role == Role.SHERIFF && player.role == Role.DEPUTY) {
            discard.addAll(source.hand);
            discard.addAll(source.table);
            source.hand.clear();
            source.table.clear();
        }
    }

    private void checkWinner() {
        Player sheriff = players.stream().filter(player -> player.role == Role.SHERIFF).findFirst().orElseThrow();
        List<Player> alive = living();
        Role side = null;
        if (!sheriff.active) {
            side = alive.size() == 1 && alive.getFirst().role == Role.RENEGADE ? Role.RENEGADE : Role.OUTLAW;
        } else if (alive.stream().noneMatch(player -> player.role == Role.OUTLAW || player.role == Role.RENEGADE)) {
            side = Role.SHERIFF;
        }
        if (side == null) { return; }
        Role winningSide = side;
        // 정상 탈락자는 팀 승리를 공유하고 명시적 기권자는 공통 lifecycle의 FORFEIT를 따른다.
        winners = players.stream().filter(player -> !player.forfeited
                && (winningSide == Role.SHERIFF ? player.role == Role.SHERIFF || player.role == Role.DEPUTY
                : player.role == winningSide)).map(player -> player.userId).toList();
        endReason = winningSide == Role.SHERIFF ? "LAW_WINS" : winningSide == Role.OUTLAW ? "OUTLAWS_WIN" : "RENEGADE_WINS";
        if (winners.isEmpty()) { endReason = "NO_ELIGIBLE_WINNERS"; }
        endedAt = now;
        phase = "FINISHED";
        deadline = null;
        actor = null;
        effects.clear();
        response = null;
    }

    private void nextTurn() {
        if (endedAt != null) { return; }
        effects.clear();
        turn = clockwiseAfter(turn).stream().findFirst().orElse(turn);
        startTurn();
    }

    private void stabilize() {
        // 빈 손패 보충은 현재 카드/피해 처리 뒤에 실행하며, 탈락한 수지에게 카드를 주지 않는다.
        replenishSuzy();
        drain();
        while (phase.equals("RESCUE") && actions(actor.userId).size() == 1) {
            eliminate(actor, damageSource);
            if (endedAt == null) { phase = "RESOLVING"; drain(); }
        }
        replenishSuzy();
    }

    private void replenishSuzy() {
        if (endedAt != null || response != null && response.kind.equals("DUEL")) { return; }
        for (Player player : living()) {
            if (player.hp > 0 && player.character == BangCharacter.SUZY_LAFAYETTE && player.hand.isEmpty()) {
                draw(player, 1);
            }
        }
    }

    private void drain() {
        while (endedAt == null && phase.equals("RESOLVING")) {
            if (!effects.isEmpty()) { effects.removeFirst().run(); }
            else if (!turn.active) { nextTurn(); }
            else { actor = turn; phase = "PLAY"; }
        }
    }

    private void draw(Player player, int count) {
        for (int index = 0; index < count; index++) {
            BangCard card = take();
            if (card != null) { player.hand.add(card); }
        }
    }

    private BangCard take() {
        if (deck.isEmpty() && !discard.isEmpty()) {
            deck.addAll(discard);
            discard.clear();
            Collections.shuffle(deck, random);
        }
        return deck.isEmpty() ? null : deck.removeFirst();
    }

    private List<Player> living() { return players.stream().filter(player -> player.active).toList(); }

    private List<Player> clockwiseAfter(Player player) {
        List<Player> order = new ArrayList<>();
        int start = players.indexOf(player);
        for (int offset = 1; offset < players.size(); offset++) {
            Player next = players.get((start + offset) % players.size());
            if (next.active) { order.add(next); }
        }
        return order;
    }

    public int distance(long from, long to) {
        Player source = find(from), target = find(to);
        List<Player> alive = living();
        if (source == null || target == null || source == target || !source.active || !target.active) { return 0; }
        int gap = Math.abs(alive.indexOf(source) - alive.indexOf(target));
        int distance = Math.min(gap, alive.size() - gap) + (target.has(Kind.MUSTANG) ? 1 : 0)
                + (target.character == BangCharacter.PAUL_REGRET ? 1 : 0) - (source.has(Kind.SCOPE) ? 1 : 0)
                - (source.character == BangCharacter.ROSE_DOOLAN ? 1 : 0);
        return Math.max(1, distance);
    }

    private int range(Player player) {
        return Math.max(1, player.table.stream().mapToInt(card -> card.kind().range()).max().orElse(1));
    }

    private boolean bang(Player player, BangCard card) {
        return card.kind() == Kind.BANG || player.character == BangCharacter.CALAMITY_JANET && card.kind() == Kind.MISSED;
    }

    private boolean missed(Player player, BangCard card) {
        return card.kind() == Kind.MISSED || player.character == BangCharacter.CALAMITY_JANET && card.kind() == Kind.BANG;
    }

    private Player find(long userId) { return players.stream().filter(player -> player.userId == userId).findFirst().orElse(null); }

    private BangCard remove(List<BangCard> cards, String id) {
        BangCard card = cards.stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow();
        cards.remove(card);
        return card;
    }

    private ObjectNode action(String kind) { return mapper.createObjectNode().put("kind", kind); }

    private ObjectNode play(BangCard card) { return action("play").put("cardId", card.id()); }

    private void note(String text) {
        history.add(text);
        if (history.size() > 30) { history.removeFirst(); }
    }

    public ObjectNode publicState() {
        ObjectNode state = mapper.createObjectNode().put("gameCode", "BANG")
                .put("status", endedAt == null ? "PLAYING" : "FINISHED").put("phase", phase)
                .put("turnUserId", endedAt == null ? Long.toString(turn.userId) : null)
                .put("actorUserId", actor == null ? null : Long.toString(actor.userId))
                .put("turnDeadline", deadline == null ? null : deadline.toString()).put("turnNumber", turnNumber)
                .put("deckCount", deck.size()).put("endReason", endReason)
                .put("endedAt", endedAt == null ? null : endedAt.toString());
        var roster = state.putArray("players");
        for (Player player : players) {
            var view = roster.addObject().put("userId", Long.toString(player.userId)).put("hp", player.hp)
                    .put("maxHp", player.maxHp).put("active", player.active).put("forfeited", player.forfeited)
                    .put("character", player.character.name()).put("cardCount", player.hand.size())
                    .put("role", player.role == Role.SHERIFF || !player.active || endedAt != null ? player.role.name() : null)
                    .put("range", range(player));
            view.set("equipment", mapper.valueToTree(player.table));
        }
        state.set("topDiscard", mapper.valueToTree(discard.isEmpty() ? null : discard.getLast()));
        state.set("store", mapper.valueToTree(store));
        state.set("lastJudgement", mapper.valueToTree(lastJudgement));
        state.put("judgementReason", judgementReason);
        state.set("winnerUserIds", mapper.valueToTree(winners.stream().map(Object::toString).toList()));
        state.set("history", mapper.valueToTree(history));
        if (response != null) {
            state.putObject("response").put("kind", response.kind).put("sourceUserId", Long.toString(response.source.userId))
                    .put("targetUserId", Long.toString(response.target.userId)).put("remaining", response.remaining);
        }
        return state;
    }

    public ObjectNode privateState(long userId) {
        ObjectNode state = mapper.createObjectNode();
        Player player = find(userId);
        if (player == null) { return state; }
        state.put("userId", Long.toString(userId)).put("role", player.role.name());
        state.set("hand", mapper.valueToTree(player.hand));
        state.set("actions", mapper.valueToTree(actions(userId)));
        state.set("choices", mapper.valueToTree(actor == player && (phase.equals("KIT") || phase.equals("LUCKY"))
                ? choices : List.of()));
        var distances = state.putObject("distances");
        for (Player target : players) { distances.put(Long.toString(target.userId), distance(userId, target.userId)); }
        return state;
    }

    public String gameId() { return gameId; }
    public String tableId() { return tableId; }
    public long version() { return version; }
    public Instant endedAt() { return endedAt; }
    public String endReason() { return endReason; }
    public List<Long> winners() { return winners; }
    public List<Long> users() { return players.stream().map(player -> player.userId).toList(); }
    public boolean active(long userId) { Player player = find(userId); return player != null && player.active; }

    private record Receipt(long expectedVersion, JsonNode input, GameActionResult result) { }

    private static final class Player {
        private final long userId;
        private final Role role;
        private final BangCharacter character;
        private final int maxHp;
        private final List<BangCard> hand = new ArrayList<>();
        private final List<BangCard> table = new ArrayList<>();
        private int hp;
        private boolean active = true;
        private boolean forfeited;

        private Player(long userId, Role role, BangCharacter character) {
            this.userId = userId;
            this.role = role;
            this.character = character;
            maxHp = character.life() + (role == Role.SHERIFF ? 1 : 0);
            hp = maxHp;
        }

        private boolean has(Kind kind) { return table.stream().anyMatch(card -> card.kind() == kind); }
    }

    private static final class Response {
        private final Player source;
        private final Player target;
        private final String kind;
        private int remaining;
        private int barrels;

        private Response(Player source, Player target, String kind, int remaining, int barrels) {
            this.source = source;
            this.target = target;
            this.kind = kind;
            this.remaining = remaining;
            this.barrels = barrels;
        }
    }
}
