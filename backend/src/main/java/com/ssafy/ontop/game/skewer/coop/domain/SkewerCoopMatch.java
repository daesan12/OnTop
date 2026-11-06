package com.ssafy.ontop.game.skewer.coop.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/** 요리 주문의 원본은 서버에만 둔다. 플레이어별 투영에서 전달된 두 장만 요리사에게 공개한다. */
public final class SkewerCoopMatch {
    public static final String CODE = "SKEWER_COOP";
    public static final List<List<String>> RECIPES = List.of(
            List.of("tomato", "cheese", "pepper", "cheese", "shrimp", "beef"),
            List.of("bacon", "beef", "bacon", "tomato", "shrimp", "pepper"),
            List.of("cheese", "shrimp", "cheese", "tomato", "bacon", "pepper", "bacon", "beef"),
            List.of("bacon", "beef", "bacon", "cheese", "pepper", "cheese", "shrimp", "tomato"),
            List.of("cheese", "pepper", "cheese", "tomato", "cheese", "bacon", "shrimp", "bacon", "beef"),
            List.of("bacon", "beef", "bacon", "shrimp", "bacon", "cheese", "pepper", "cheese", "tomato"));
    public static final int CLEAN_POINTS = 2, COLLECTION_POINTS = 2, WASHER_LOAD_POINTS = 3;
    public static final int WRONG_DELIVERY_PENALTY = 10;
    private static final long RESTART_RESPONSE_MILLIS = 15_000;
    private static final int[] POINTS = {100, 100, 240, 160, 160, 240};
    private static final double[] TABLE_X = {-7.5, 0, 7.5, -7.5, 0, 7.5};
    private static final Map<String, Point> STATIONS = Map.of(
            "orders", new Point(-2.6, -4.25), "pickup", new Point(2.2, -4.25),
            "fridge", new Point(10, -4.25), "washer", new Point(-6.4, -4.25),
            "storage", new Point(6.6, -4.25));
    private final ObjectMapper mapper;
    private final Random random;
    private final List<Integer> menuBag = new ArrayList<>();
    private final List<Long> players = new ArrayList<>();
    private final Map<Long, String> roles = new HashMap<>();
    private final Map<Long, Boolean> ready = new HashMap<>();
    private final Map<Long, Long> missing = new HashMap<>();
    private final Set<Long> pausedBy = new LinkedHashSet<>();
    private final List<Table> tables = new ArrayList<>();
    private final List<Integer> held = new ArrayList<>();
    private final List<Dish> jobs = new ArrayList<>(), pass = new ArrayList<>();
    private final List<Dish> carry = new ArrayList<>(), stored = new ArrayList<>();
    private final List<Dirty> dirty = new ArrayList<>(), washing = new ArrayList<>();
    private final List<String> skewer = new ArrayList<>();
    private final List<String> pantry = new ArrayList<>(List.of("tomato", "pepper", "shrimp", "beef", "cheese", "bacon"));
    private int completed;
    private final List<Integer> queue = new ArrayList<>();
    private final Map<Long, Double> greetingAnswers = new HashMap<>();
    private final Map<Long, Double> speechUntil = new HashMap<>();
    private final double duration;
    private final double[] greetingAt;
    private String phase = "WAITING", selectedJob, endReason;
    private boolean chefVR, rankingEligible = true, registered;
    private String rankingMode = "PC";
    private double elapsed, serviceElapsed, countdown, greetingElapsed, washRemaining;
    private double nextArrival = 0, nextQueue = 12, cleanProgress, velocityX, velocityZ;
    private Point position = new Point(-2.8, 1.15);
    private final List<Point> path = new ArrayList<>();
    private long lastTick, movementAt, dishSequence, dirtySequence;
    private long restartSequence, restartRequester, restartExpiresAt;
    private int round;
    private int sake, score, served, washerCompleted, cleanTable, greetingIndex;
    private String message = "두 사람이 모이면 역할을 고르고 준비해주세요.";
    public final String id;
    public final String channelId;
    public long version;
    // 표시용 시계/이동 틱이 아직 도착 중인 입력을 무효화하지 않게 행동 토큰을 별도로 관리한다.
    public long actionVersion;

    public SkewerCoopMatch(String id, String channelId, long host, ObjectMapper mapper,
            Random random, long now, double duration) {
        this.id = id;
        this.channelId = channelId;
        this.mapper = mapper;
        this.random = random;
        this.duration = duration;
        this.lastTick = now;
        this.greetingAt = new double[] {duration * (.22 + random.nextDouble() * .12),
                duration * (.60 + random.nextDouble() * .14)};
        players.add(host);
        for (int table = 1; table <= 6; table++) {
            tables.add(new Table(table));
        }
        queue.addAll(List.of(1, 2, 1));
    }

    public List<Long> players() { return List.copyOf(players); }
    public boolean contains(long user) { return players.contains(user); }
    public boolean finished() { return phase.equals("FINISHED"); }
    public boolean waiting() { return phase.equals("WAITING"); }
    public boolean registered() { return registered; }
    public void registered(boolean value) { registered = value; }
    public boolean canJoin(long user) {
        return !finished() && (contains(user) || phase.equals("WAITING") && players.size() < 2);
    }

    public void join(long user) {
        require(canJoin(user));
        if (!contains(user)) {
            players.add(user);
            version++;
        }
    }

    public void tick(long now, java.util.function.LongPredicate connected) {
        double delta = Math.max(0, Math.min(1, (now - lastTick) / 1000.0));
        lastTick = now;
        if (finished()) {
            return;
        }
        for (long player : players) {
            if (connected.test(player)) {
                if (missing.remove(player) != null) {
                    version++;
                }
            } else if (missing.putIfAbsent(player, now) == null) {
                version++;
                velocityX = 0;
                velocityZ = 0;
                path.clear();
                cleanTable = 0;
            }
        }
        if (missing.values().stream().anyMatch(at -> now - at >= 30000)) {
            finish("SKEWER_DISCONNECT_TIMEOUT");
            return;
        }
        if (restartRequester != 0 && (!missing.isEmpty() || now >= restartExpiresAt)) {
            clearRestart();
            message = missing.isEmpty() ? "다시 시작 응답 시간이 지나 기존 경기를 이어가요."
                    : "연결이 끊겨 다시 시작 요청을 취소했어요.";
            actionVersion++;
            version++;
            return;
        }
        if (restartRequester != 0) {
            // 응답 제한은 벽시계를 사용한다. 영업·인사·세척 시간은 동의 대기 중 멈춘다.
            return;
        }
        if (!missing.isEmpty() || !pausedBy.isEmpty() || phase.equals("WAITING")) {
            return;
        }
        if (phase.equals("COUNTDOWN")) {
            countdown = Math.max(0, countdown - delta);
            if (countdown == 0) {
                phase = "PLAYING";
                message = "영업 시작! 손님에게 주문을 받아주세요.";
            }
            version++;
            return;
        }
        // 인사 응답 중에도 영업 제한시간은 흐르고, 0초에서는 인사 보너스보다 종료가 우선한다.
        elapsed = Math.min(duration, elapsed + delta);
        if (elapsed >= duration) {
            finish("SKEWER_TIME_UP");
            return;
        }
        if (greetingActive()) {
            greetingElapsed += delta;
            if (greetingElapsed >= 5 || greetingAnswers.size() == 2) {
                int bonus = greetingAnswers.size() == 2
                        ? (int) Math.round(50 * Math.max(0, 1 - Collections.max(greetingAnswers.values()) / 5)) : 0;
                score += bonus;
                greetingIndex++;
                greetingAnswers.clear();
                greetingElapsed = 0;
                message = "인사 완료! +" + bonus + "점";
                actionVersion++;
            }
            version++;
            return;
        }
        // 입장·식사·서빙 속도 계산은 기존처럼 인사 구간을 제외한다.
        serviceElapsed += delta;
        if (now - movementAt > 400) {
            velocityX = 0;
            velocityZ = 0;
        }
        move(delta);
        if (cleanTable > 0) {
            cleanProgress += delta;
            if (cleanProgress >= 1.5) {
                Table table = tables.get(cleanTable - 1);
                dirty.add(new Dirty(++dirtySequence, table.id, table.settings));
                score += CLEAN_POINTS + COLLECTION_POINTS;
                table.state = "clean";
                table.dishes.clear();
                table.sake = 0;
                table.people = 0;
                cleanTable = 0;
                cleanProgress = 0;
                message = "정리 +2점 · 식기 수거 +2점! 세척기에 넣어주세요.";
                actionVersion++;
            }
        }
        if (!washing.isEmpty()) {
            washRemaining = Math.max(0, washRemaining - delta);
            if (washRemaining == 0) {
                washerCompleted += washing.size();
                washing.clear();
                actionVersion++;
            }
        }
        for (Table table : tables) {
            if (table.state.equals("eating") && serviceElapsed >= table.eatUntil) {
                table.state = "dirty";
                table.people = 0;
                actionVersion++;
            }
        }
        if (serviceElapsed >= nextQueue && queue.size() < 3) {
            queue.add(random.nextBoolean() ? 1 : 2);
            nextQueue = serviceElapsed + 12;
        }
        if (serviceElapsed >= nextArrival) {
            seatNext();
            nextArrival = serviceElapsed + 1;
        }
        version++;
    }

    public void act(long user, JsonNode input, long now) {
        require(contains(user) && input.path("type").isTextual());
        String type = input.path("type").asText();
        Set<String> fields = switch (type) {
            case "ROLE" -> Set.of("type", "role");
            case "CHEF_MODE" -> Set.of("type", "vr");
            case "READY" -> Set.of("type", "ready");
            case "PAUSE" -> Set.of("type", "paused");
            case "RESTART_REPLY" -> Set.of("type", "requestId", "accept");
            case "MOVE" -> Set.of("type", "dx", "dz");
            case "NAVIGATE" -> Set.of("type", "x", "z");
            case "TAKE_STORED", "CHOOSE" -> Set.of("type", "id");
            case "THREAD" -> Set.of("type", "ingredient");
            default -> Set.of("type");
        };
        input.fieldNames().forEachRemaining(field -> require(fields.contains(field)));
        if (finished()) {
            throw new Rejected(Rejection.GAME_FINISHED);
        }
        if (type.equals("RESTART_REQUEST")) {
            require((phase.equals("PLAYING") || phase.equals("COUNTDOWN")) && players.size() == 2
                    && missing.isEmpty() && pausedBy.isEmpty() && restartRequester == 0);
            restartSequence++;
            restartRequester = user;
            restartExpiresAt = now + RESTART_RESPONSE_MILLIS;
            velocityX = 0;
            velocityZ = 0;
            path.clear();
            lastTick = now;
        } else if (type.equals("RESTART_REPLY")) {
            require(restartRequester != 0 && user != restartRequester && now < restartExpiresAt
                    && missing.isEmpty() && input.path("requestId").isTextual()
                    && input.path("requestId").asText().equals(Long.toString(restartSequence))
                    && input.path("accept").isBoolean());
            if (input.path("accept").asBoolean()) {
                restart(now);
            } else {
                clearRestart();
                lastTick = now;
                message = "친구가 다시 시작을 거절했어요. 기존 경기를 이어가요.";
            }
        } else if (type.equals("ROLE")) {
            require(phase.equals("WAITING") && players.size() == 2);
            String role = input.path("role").asText();
            require(List.of("chef", "server").contains(role));
            require(roles.entrySet().stream()
                    .noneMatch(entry -> entry.getKey() != user && entry.getValue().equals(role)));
            roles.put(user, role);
            ready.clear();
            if (role.equals("chef")) {
                chefVR = false;
            }
        } else if (type.equals("CHEF_MODE")) {
            require("chef".equals(roles.get(user)) && input.path("vr").isBoolean());
            chefVR = input.path("vr").asBoolean();
            if (!phase.equals("WAITING") && chefVR != rankingMode.equals("VR")) {
                rankingEligible = false;
            }
        } else if (type.equals("READY")) {
            require(phase.equals("WAITING") && roles.size() == 2 && input.path("ready").isBoolean());
            ready.put(user, input.path("ready").asBoolean());
            if (players.stream().allMatch(player -> Boolean.TRUE.equals(ready.get(player)))) {
                phase = "COUNTDOWN";
                countdown = 3;
                rankingEligible = true;
                rankingMode = chefVR ? "VR" : "PC";
            }
        } else if (type.equals("PAUSE")) {
            require((phase.equals("COUNTDOWN") || phase.equals("PLAYING")) && input.path("paused").isBoolean()
                    && restartRequester == 0);
            // 각 참가자는 자신의 확인창만 해제할 수 있다. 다른 참가자의 일시정지는 유지한다.
            if (input.path("paused").asBoolean()) {
                pausedBy.add(user);
                velocityX = 0;
                velocityZ = 0;
                path.clear();
                cleanTable = 0;
                cleanProgress = 0;
            } else {
                pausedBy.remove(user);
            }
            lastTick = now;
        } else if (type.equals("GREET")) {
            require(greetingActive() && missing.isEmpty() && pausedBy.isEmpty() && restartRequester == 0
                    && !greetingAnswers.containsKey(user));
            greetingAnswers.put(user, greetingElapsed);
            speechUntil.put(user, elapsed + 2.5);
        } else {
            require(phase.equals("PLAYING") && missing.isEmpty() && pausedBy.isEmpty() && restartRequester == 0
                    && !greetingActive());
            if ("server".equals(roles.get(user))) {
                serverAction(type, input, now);
            } else if ("chef".equals(roles.get(user))) {
                chefAction(type, input);
            } else {
                throw new Rejected(Rejection.ACCESS_DENIED);
            }
        }
        if (!Set.of("MOVE", "NAVIGATE", "CLEAN_CANCEL").contains(type)) {
            actionVersion++;
        }
        version++;
    }

    private void serverAction(String type, JsonNode input, long now) {
        if (type.equals("NAVIGATE")) {
            require(input.path("x").isNumber() && input.path("z").isNumber());
            double x = input.path("x").asDouble(), z = input.path("z").asDouble();
            require(Double.isFinite(x) && Double.isFinite(z));
            Point destination = new Point(x, z);
            require(walkable(destination));
            List<Point> next = route(destination);
            require(!next.isEmpty() || position.distance(destination) < .2);
            path.clear();
            path.addAll(next);
            velocityX = 0;
            velocityZ = 0;
            cleanTable = 0;
            cleanProgress = 0;
            return;
        }
        if (type.equals("MOVE")) {
            require(input.path("dx").isNumber() && input.path("dz").isNumber());
            double dx = input.path("dx").asDouble(), dz = input.path("dz").asDouble();
            require(Double.isFinite(dx) && Double.isFinite(dz) && Math.abs(dx) <= 1 && Math.abs(dz) <= 1);
            double length = Math.max(1, Math.hypot(dx, dz));
            velocityX = dx / length;
            velocityZ = dz / length;
            path.clear();
            movementAt = now;
            if (dx != 0 || dz != 0) {
                cleanTable = 0;
                cleanProgress = 0;
            }
            return;
        }
        if (type.equals("CLEAN_CANCEL")) {
            cleanTable = 0;
            cleanProgress = 0;
            return;
        }
        String at = nearest();
        require(at != null);
        if (type.equals("RETURN_SAKE")) {
            require(at.equals("fridge") && dirty.isEmpty());
            sake = 0;
            message = "사케를 냉장고에 반납했어요.";
            return;
        }
        if (type.equals("TAKE_STORED")) {
            require(at.equals("storage") && dirty.isEmpty() && carry.size() < 2);
            Dish dish = stored.stream().filter(value -> value.id.equals(input.path("id").asText()))
                    .findFirst().orElseThrow(() -> new Rejected(Rejection.INVALID_ACTION));
            stored.remove(dish);
            carry.add(dish);
            return;
        }
        require(type.equals("INTERACT"));
        if (at.equals("washer")) {
            require(!dirty.isEmpty() && washing.size() < 2);
            int loaded = Math.min(dirty.size(), 2 - washing.size());
            score += loaded * WASHER_LOAD_POINTS;
            message = "세척기 투입 +" + loaded * WASHER_LOAD_POINTS + "점! 마지막 투입부터 8초간 세척해요.";
            washing.addAll(dirty.subList(0, loaded));
            dirty.subList(0, loaded).clear();
            washRemaining = 8;
            return;
        }
        if (!at.startsWith("table-")) {
            require(dirty.isEmpty());
            switch (at) {
                case "orders" -> {
                    require(!held.isEmpty());
                    for (int id : held) {
                        Table table = tables.get(id - 1);
                        table.state = "cooking";
                        jobs.addAll(table.dishes);
                    }
                    held.clear();
                    if (selectedJob == null && !jobs.isEmpty()) {
                        selectedJob = jobs.getFirst().id;
                    }
                    message = "요리사에게 주문을 전달했어요.";
                }
                case "pickup" -> {
                    require(carry.size() < 2 && !pass.isEmpty());
                    carry.add(pass.removeFirst());
                }
                case "fridge" -> { require(sake < 2); sake++; }
                case "storage" -> {
                    require(!carry.isEmpty());
                    stored.addAll(carry);
                    carry.clear();
                }
                default -> throw new Rejected(Rejection.INVALID_ACTION);
            }
            return;
        }
        Table table = tables.get(Integer.parseInt(at.substring(6)) - 1);
        if (table.state.equals("dirty")) {
            require(carry.isEmpty() && sake == 0 && dirty.size() < 2);
            if (cleanTable != table.id) {
                cleanTable = table.id;
                cleanProgress = 0;
                velocityX = 0;
                velocityZ = 0;
                path.clear();
            }
        } else {
            require(dirty.isEmpty());
            if (table.state.equals("unreceived")) {
                require(held.size() < 2);
                table.state = "collected";
                held.add(table.id);
            } else if (List.of("collected", "cooking", "ready").contains(table.state)) {
                int bottles = Math.min(sake, table.sake - table.sakeDelivered);
                boolean matchingDish = carry.stream().anyMatch(dish -> dish.table == table.id && !dish.delivered);
                if (!matchingDish && bottles == 0 && (!carry.isEmpty() || sake > 0)) {
                    int penalty = Math.min(score, WRONG_DELIVERY_PENALTY);
                    score -= penalty;
                    message = "오배송 -" + penalty + "점! " + table.id
                            + "번 주문과 달라요. 음식은 트레이에 남아 있어요.";
                    return;
                }
                List<Dish> incorrect = carry.stream().filter(dish -> dish.table == table.id
                        && !recipeMatches(dish.recipe, RECIPES.get(dish.menu))).toList();
                for (Dish dish : incorrect) {
                    score = Math.max(0, score - WRONG_DELIVERY_PENALTY);
                    Dish original = table.dishes.stream().filter(value -> value.id.equals(dish.id)).findFirst()
                            .orElseThrow(() -> new IllegalStateException("원본 주문이 없습니다."));
                    if (!original.delivered && jobs.stream().noneMatch(value -> value.id.equals(original.id))) {
                        jobs.add(original);
                    }
                }
                carry.removeAll(incorrect);
                if (!incorrect.isEmpty()) {
                    table.state = "cooking";
                    if (selectedJob == null && !jobs.isEmpty()) {
                        selectedJob = jobs.getFirst().id;
                    }
                }
                int carriedBefore = carry.size();
                carry.removeIf(dish -> {
                    if (dish.table != table.id || dish.delivered) {
                        return false;
                    }
                    dish.delivered = true;
                    table.dishes.stream().filter(value -> value.id.equals(dish.id)).forEach(value -> value.delivered = true);
                    score += POINTS[dish.menu];
                    return true;
                });
                sake -= bottles;
                table.sakeDelivered += bottles;
                score += bottles * 30;
                message = table.id + "번에 접시 " + (carriedBefore - carry.size())
                        + "개 · 사케 " + bottles + "병을 전달했어요.";
                if (!incorrect.isEmpty()) {
                    message = "주문과 다른 꼬치예요. 접시당 10점 감점 · 주방에 다시 주문했어요.";
                }
                if (table.dishes.stream().allMatch(dish -> dish.delivered) && table.sake == table.sakeDelivered) {
                    double target = table.dishes.stream().mapToDouble(dish -> POINTS[dish.menu] == 100 ? 45
                            : POINTS[dish.menu] == 160 ? 60 : 80).sum();
                    score += (int) Math.round(30 * Math.max(0, 1 - (serviceElapsed - table.seatedAt) / target));
                    table.state = "eating";
                    table.eatUntil = serviceElapsed + 6.5;
                    served++;
                }
            } else {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
        }
    }

    private static boolean recipeMatches(List<String> actual, List<String> expected) {
        List<String> reversed = new ArrayList<>(expected);
        Collections.reverse(reversed);
        return expected.equals(actual) || reversed.equals(actual);
    }

    private void chefAction(String type, JsonNode input) {
        if (type.equals("CHOOSE")) {
            String id = input.path("id").asText();
            require(jobs.stream().limit(2).anyMatch(job -> job.id.equals(id)));
            selectedJob = id;
        } else if (type.equals("THREAD")) {
            require(!jobs.isEmpty());
            String ingredient = input.path("ingredient").asText();
            require(List.of("tomato", "pepper", "shrimp", "beef", "cheese", "bacon").contains(ingredient));
            long maximum = List.of("cheese", "bacon").contains(ingredient) ? 3 : 1;
            require(Collections.frequency(skewer, ingredient) < maximum);
            int last = skewer.lastIndexOf(ingredient);
            require(maximum == 1 || last < 0 || skewer.size() - last == 2);
            skewer.add(ingredient);
        } else if (type.equals("UNTHREAD")) {
            require(!skewer.isEmpty());
            skewer.removeLast();
        } else if (type.equals("SUBMIT")) {
            Dish job = jobs.stream().limit(2).filter(value -> value.id.equals(selectedJob)).findFirst()
                    .orElseThrow(() -> new Rejected(Rejection.INVALID_ACTION));
            require(!skewer.isEmpty());
            require(Collections.frequency(skewer, "cheese") != 1 && Collections.frequency(skewer, "bacon") != 1);
            require(pass.size() < 2);
            pass.add(new Dish(job.id, job.table, job.menu, List.copyOf(skewer)));
            completed++;
            if (!chefVR) {
                List<String> previous = List.copyOf(pantry);
                Collections.shuffle(pantry, random);
                if (previous.equals(pantry)) {
                    Collections.rotate(pantry, 1);
                }
            }
            jobs.remove(job);
            skewer.clear();
            selectedJob = jobs.isEmpty() ? null : jobs.getFirst().id;
            Table table = tables.get(job.table - 1);
            if (jobs.stream().noneMatch(value -> value.table == table.id)) {
                table.state = "ready";
            }
            message = job.table + "번 완성 접시를 제출했어요.";
        } else {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
    }

    private void seatNext() {
        for (int index = 0; index < queue.size(); index++) {
            int size = queue.get(index);
            Table target = tables.stream().filter(table -> table.state.equals("clean")
                    && (size == 2 ? table.id > 3 : table.id <= 3)).findFirst().orElse(null);
            if (target == null && size == 1 && !queue.contains(2)) {
                target = tables.stream().filter(table -> table.state.equals("clean")).findFirst().orElse(null);
            }
            if (target == null) {
                continue;
            }
            target.state = "unreceived";
            target.people = size;
            target.settings = size;
            target.seatedAt = serviceElapsed;
            target.sake = random.nextInt(size + 1);
            target.sakeDelivered = 0;
            for (int person = 0; person < size; person++) {
                if (menuBag.isEmpty()) {
                    menuBag.addAll(List.of(0, 1, 2, 3, 4, 5));
                    Collections.shuffle(menuBag, random);
                }
                target.dishes.add(new Dish("dish-" + ++dishSequence, target.id, menuBag.removeFirst()));
            }
            queue.remove(index);
            actionVersion++;
            return;
        }
    }

    private void clearRestart() {
        restartRequester = 0;
        restartExpiresAt = 0;
    }

    private void restart(long now) {
        clearRestart();
        round++;
        phase = "COUNTDOWN";
        countdown = 3;
        elapsed = 0;
        serviceElapsed = 0;
        greetingElapsed = 0;
        greetingIndex = 0;
        greetingAnswers.clear();
        speechUntil.clear();
        greetingAt[0] = duration * (.22 + random.nextDouble() * .12);
        greetingAt[1] = duration * (.60 + random.nextDouble() * .14);
        tables.clear();
        for (int table = 1; table <= 6; table++) {
            tables.add(new Table(table));
        }
        held.clear();
        jobs.clear();
        pass.clear();
        carry.clear();
        stored.clear();
        dirty.clear();
        washing.clear();
        skewer.clear();
        menuBag.clear();
        queue.clear();
        queue.addAll(List.of(1, 2, 1));
        pantry.clear();
        pantry.addAll(List.of("tomato", "pepper", "shrimp", "beef", "cheese", "bacon"));
        selectedJob = null;
        sake = 0;
        score = 0;
        served = 0;
        completed = 0;
        washerCompleted = 0;
        washRemaining = 0;
        cleanTable = 0;
        cleanProgress = 0;
        nextArrival = 0;
        nextQueue = 12;
        velocityX = 0;
        velocityZ = 0;
        path.clear();
        position = new Point(-2.8, 1.15);
        movementAt = now;
        lastTick = now;
        // 경기 ID·행동 버전·접시 ID와 랭킹 제외 이력은 유지한다. 중도 재시작은 정산하지 않는다.
        message = "두 사람이 동의했어요. 다시 영업을 준비해요!";
    }

    public void finish(String reason) {
        if (!finished()) {
            phase = "FINISHED";
            pausedBy.clear();
            clearRestart();
            endReason = reason;
            if (!"SKEWER_TIME_UP".equals(reason)) {
                rankingEligible = false;
            }
            cleanTable = 0;
            velocityX = 0;
            velocityZ = 0;
            path.clear();
            actionVersion++;
            version++;
        }
    }

    private boolean greetingActive() {
        return phase.equals("PLAYING") && greetingIndex < 2 && elapsed >= greetingAt[greetingIndex];
    }

    public ObjectNode publicView(long user) {
        ObjectNode view = mapper.createObjectNode();
        view.put("gameCode", CODE).put("phase", phase).put("channelId", channelId);
        view.put("actionVersion", actionVersion);
        view.put("round", round);
        view.set("restart", restartRequester == 0 ? mapper.nullNode() : mapper.valueToTree(Map.of(
                "id", Long.toString(restartSequence), "requestedBy", Long.toString(restartRequester),
                "expiresAt", restartExpiresAt)));
        view.put("remaining", Math.max(0, duration - elapsed)).put("countdown", countdown);
        view.put("elapsed", elapsed).put("score", score).put("served", served);
        view.put("rankingEligible", rankingEligible).put("chefVR", chefVR).put("rankingMode", rankingMode);
        view.put("rewardStatus", "SERVER_SETTLEMENT").put("entryFee", 0);
        view.put("message", message).put("paused", !finished()
                && (!missing.isEmpty() || !pausedBy.isEmpty() || restartRequester != 0));
        view.put("pauseReason", finished() ? "" : !missing.isEmpty() ? "DISCONNECTED"
                : restartRequester != 0 ? "RESTART_CONFIRM" : !pausedBy.isEmpty() ? "EXIT_CONFIRM" : "");
        view.set("pausedBy", mapper.valueToTree(pausedBy.stream().map(String::valueOf).toList()));
        view.put("endReason", endReason);
        view.set("players", mapper.valueToTree(players.stream().map(player -> Map.of(
                "userId", Long.toString(player), "role", roles.getOrDefault(player, ""),
                "ready", Boolean.TRUE.equals(ready.get(player)), "connected", !missing.containsKey(player))).toList()));
        view.set("greeting", mapper.valueToTree(Map.of("active", greetingActive(), "index", greetingIndex,
                "remaining", Math.max(0, 5 - greetingElapsed), "answered", greetingAnswers.containsKey(user),
                "responded", greetingAnswers.size(), "speech", speechUntil.getOrDefault(user, 0.0) > elapsed)));
        return view;
    }

    public ObjectNode privateView(long user) {
        ObjectNode result = mapper.createObjectNode();
        String role = roles.getOrDefault(user, "");
        result.put("role", role);
        if (role.equals("server")) {
            ObjectNode hall = mapper.createObjectNode();
            hall.set("position", mapper.valueToTree(position));
            hall.set("tables", mapper.valueToTree(tables.stream().map(Table::view).toList()));
            hall.set("held", mapper.valueToTree(held));
            hall.set("carry", mapper.valueToTree(carry.stream().map(Dish::view).toList()));
            hall.set("stored", mapper.valueToTree(stored.stream().map(Dish::view).toList()));
            hall.set("pass", mapper.valueToTree(pass.stream().map(Dish::view).toList()));
            hall.set("kitchen", mapper.valueToTree(jobs.stream().map(Dish::view).toList()));
            hall.set("dirtyDishes", mapper.valueToTree(dirty));
            hall.set("washer", mapper.valueToTree(Map.of("load", washing, "remaining", washRemaining,
                    "completed", washerCompleted)));
            hall.set("queue", mapper.valueToTree(java.util.stream.IntStream.range(0, queue.size())
                    .mapToObj(index -> Map.of("id", index + 1, "size", queue.get(index))).toList()));
            hall.put("sake", sake);
            hall.set("clean", cleanTable == 0 ? mapper.nullNode()
                    : mapper.valueToTree(Map.of("table", cleanTable, "progress", cleanProgress / 1.5)));
            result.set("hall", hall);
        } else if (role.equals("chef")) {
            ObjectNode chef = mapper.createObjectNode();
            chef.set("visible", mapper.valueToTree(jobs.stream().limit(2).map(Dish::view).toList()));
            chef.put("waiting", Math.max(0, jobs.size() - 2)).put("selectedJob", selectedJob);
            chef.set("skewer", mapper.valueToTree(skewer));
            chef.set("pantry", mapper.valueToTree(pantry));
            chef.put("completed", completed);
            // 주문/레시피를 제외한 홀의 외형만 요리사에게 전달한다.
            ObjectNode sight = mapper.createObjectNode();
            sight.set("position", mapper.valueToTree(position));
            sight.put("carrying", !carry.isEmpty() || sake > 0 || !dirty.isEmpty());
            sight.put("cleaning", cleanTable != 0);
            sight.set("tables", mapper.valueToTree(tables.stream().map(table -> Map.of(
                    "id", table.id, "people", table.people,
                    "eating", table.state.equals("eating"), "dirty", table.state.equals("dirty"))).toList()));
            chef.set("hallSight", sight);
            chef.set("pass", mapper.valueToTree(pass.stream().map(Dish::view).toList()));
            result.set("chef", chef);
        }
        return result;
    }

    private void move(double seconds) {
        double remaining = Math.min(.1, Math.max(0, seconds)) * 5.0;
        // 짧은 경유점에 도착해도 이번 틱의 남은 이동량을 다음 구간에 사용한다.
        // 작은 단위로 기존 축별 충돌 검사를 유지해 가구 모서리를 건너뛰지 않는다.
        while (remaining > .000001) {
            while (!path.isEmpty() && position.distance(path.getFirst()) < .000001) {
                path.removeFirst();
            }
            double dx = velocityX, dz = velocityZ;
            double step = Math.min(.1, remaining);
            if (!path.isEmpty()) {
                Point goal = path.getFirst();
                double length = position.distance(goal);
                dx = (goal.x - position.x) / length;
                dz = (goal.z - position.z) / length;
                step = Math.min(step, length);
            }
            Point before = position;
            Point next = new Point(position.x + dx * step, position.z);
            if (walkable(next)) {
                position = next;
            }
            next = new Point(position.x, position.z + dz * step);
            if (walkable(next)) {
                position = next;
            }
            if (position.distance(before) < .000001) {
                break;
            }
            remaining -= step;
        }
    }

    private List<Point> route(Point destination) {
        Point origin = new Point(Math.round(position.x * 4) / 4.0, Math.round(position.z * 4) / 4.0);
        List<Point> queue = new ArrayList<>(List.of(origin));
        Map<Point, Point> parent = new HashMap<>();
        parent.put(origin, null);
        for (int index = 0; index < queue.size() && index < 8000; index++) {
            Point current = queue.get(index);
            if (current.distance(destination) < .32) {
                List<Point> result = new ArrayList<>(List.of(destination));
                for (Point point = current; point != null; point = parent.get(point)) {
                    result.addFirst(point);
                }
                result.removeFirst();
                return result;
            }
            for (Point direction : List.of(new Point(.25, 0), new Point(-.25, 0),
                    new Point(0, .25), new Point(0, -.25))) {
                Point next = new Point(current.x + direction.x, current.z + direction.z);
                if (walkable(next) && !parent.containsKey(next)) {
                    parent.put(next, current);
                    queue.add(next);
                }
            }
        }
        return List.of();
    }

    private boolean walkable(Point point) {
        if (point.x < -11.4 || point.x > 11.4 || point.z < -4.45 || point.z > 6.7) {
            return false;
        }
        for (int index = 0; index < 6; index++) {
            boolean single = index < 3;
            double x = TABLE_X[index], z = single ? -1.55 : 3.7;
            if (inside(point, x, z, single ? .98 : 1.5, single ? .98 : 1.04)) {
                return false;
            }
            if (single ? inside(point, x, -2.87, .46, .46)
                    : inside(point, x - 1.9, z, .46, .46) || inside(point, x + 1.9, z, .46, .46)) {
                return false;
            }
        }
        if (inside(point, -.25, -5.75, 5.05, .65) || inside(point, 10, -5.75, .83, .7)
                || inside(point, -6.4, -5.75, .85, .7) || inside(point, 6.6, -5.75, 1.33, .75)) {
            return false;
        }
        for (double z : new double[] {-3.5, 2.6, 6.5}) {
            if (inside(point, -11.25, z, .28, .28) || inside(point, 11.25, z, .28, .28)) {
                return false;
            }
        }
        return true;
    }

    private boolean inside(Point point, double x, double z, double halfX, double halfZ) {
        return Math.abs(point.x - x) < halfX + .32 && Math.abs(point.z - z) < halfZ + .32;
    }

    private String nearest() {
        double best = .92;
        String target = null;
        for (var station : STATIONS.entrySet()) {
            double distance = position.distance(station.getValue());
            if (distance <= best) {
                best = distance;
                target = station.getKey();
            }
        }
        for (int index = 0; index < 6; index++) {
            double x = TABLE_X[index], z = index < 3 ? -1.55 : 3.7;
            List<Point> approaches = index < 3
                    ? List.of(new Point(x, 0), new Point(x - 1.65, z), new Point(x + 1.65, z))
                    : List.of(new Point(x, 2.1), new Point(x, 5.3));
            for (Point point : approaches) {
                double distance = position.distance(point);
                if (distance <= best) {
                    best = distance;
                    target = "table-" + (index + 1);
                }
            }
        }
        return target;
    }

    private static void require(boolean condition) {
        if (!condition) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
    }

    public record Point(double x, double z) {
        double distance(Point other) { return Math.hypot(x - other.x, z - other.z); }
    }

    public record Dirty(long id, int table, int settings) { }

    private static final class Dish {
        final String id;
        final int table, menu;
        final List<String> recipe;
        boolean delivered;

        Dish(String id, int table, int menu) {
            this(id, table, menu, RECIPES.get(menu));
        }

        Dish(String id, int table, int menu, List<String> recipe) {
            this.id = id;
            this.table = table;
            this.menu = menu;
            this.recipe = List.copyOf(recipe);
        }

        Map<String, Object> view() {
            return Map.of("id", id, "table", table, "recipe", recipe, "delivered", delivered);
        }
    }

    private static final class Table {
        final int id;
        String state = "clean";
        int people, sake, sakeDelivered, settings = 1;
        double seatedAt, eatUntil;
        final List<Dish> dishes = new ArrayList<>();

        Table(int id) { this.id = id; }

        Map<String, Object> view() {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", id);
            view.put("status", state);
            view.put("people", people);
            view.put("eatUntil", state.equals("eating") ? eatUntil : null);
            view.put("bill", dishes.isEmpty() ? null : Map.of("dishes", dishes.stream().map(Dish::view).toList(),
                    "sake", sake, "sakeDelivered", sakeDelivered));
            return view;
        }
    }
}
