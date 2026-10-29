package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.service.BungeoppangV4DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts;
import com.ssafy.ontop.minigame.service.BungeoppangV5DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV5Rules;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.minigame.service.MinigameException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The FE common fixture is read in place so a contract change on either side fails this test. */
class BungeoppangV5FixtureContractTests {
    private static final Path FIXTURE = Path.of("..", "frontend", "tests", "fixtures", "bungeoppang-v5.json");
    private static final String DELIVERY_KEY = "delivery-two";
    /** The fixture ends at 22.2 s, inside every issued play window. */
    private static final BungeoppangV4Responses.Rules CURRENT =
            BungeoppangV5Spec.calculationRules(BungeoppangV5Spec.rules());
    private final ObjectMapper json = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);

    @Test
    void FE_공통_fixture를_같은_행동_로그로_재계산하면_기대_결과와_같다() throws Exception {
        JsonNode fixture = fixture();
        JsonNode expected = fixture.path("expected");

        var result = new BungeoppangV5Rules().replay(
                BungeoppangV5DeliveryContract.domainActions(wire(fixture.path("log"))),
                integers(fixture.path("heats")), orders(fixture.path("orders")), CURRENT);

        assertThat(BungeoppangV5Spec.RULES_VERSION).isEqualTo(expected.path("rulesVersion").textValue());
        assertThat(result.heatCursor()).isEqualTo(expected.path("fills").intValue());
        assertThat(result.score()).isEqualTo(expected.path("score").longValue());
        assertThat(result.made()).isEqualTo(expected.path("made").intValue());
        assertThat(result.golden()).isEqualTo(expected.path("golden").intValue());
        assertThat(result.failed()).isEqualTo(expected.path("failed").intValue());
        assertThat(result.wasted()).isEqualTo(expected.path("wasted").intValue());
        assertThat(result.combo()).isEqualTo(expected.path("combo").intValue());
        assertThat(result.maxCombo()).isEqualTo(expected.path("maxCombo").intValue());
        assertThat(result.served()).isEqualTo(expected.path("served").intValue());
        assertThat(result.customersServed()).isEqualTo(expected.path("customersServed").intValue());
        assertThat(result.tray()).hasSize(expected.path("tray").size());
        assertThat(result.activeOrders()).extracting(BungeoppangV5Rules.Order::orderId).containsExactly("1", "3");
        assertThat(result.slots()).allSatisfy(slot -> {
            assertThat(slot.phase()).isEqualTo("empty");
            assertThat(slot.since()).isZero();
            assertThat(slot.heat()).isEqualTo(100);
        });
    }

    @Test
    void v5_prefix_hash는_FE_알고리즘의_고정값과_같고_v4_해시는_바뀌지_않는다() throws Exception {
        JsonNode fixture = fixture();
        List<BungeoppangV4DeliveryDtos.Action> all = wire(fixture.path("log"));
        List<BungeoppangV4DeliveryDtos.Action> delivery = all.subList(0, 5);
        String config = BungeoppangV5Spec.LEGACY_CONFIG_VERSION;

        // Existing three-minute rounds keep the values they were issued with.
        assertThat(config).isEqualTo("v5-20261027.1").isNotEqualTo("v4-20261027.1");
        assertThat(BungeoppangV5Spec.initialPrefixHash(901, config))
                .isEqualTo("7ac7c529cf10bc98977c5c7676d8b295f8ceb682857bb5727ffe6953470e1876");
        assertThat(BungeoppangV5DeliveryContract.prefixHash(901, config, delivery))
                .isEqualTo("a2793d12d244a95dd6410b1f8219406e6b86074bca1fc9f42bd56686002f9850");
        assertThat(BungeoppangV5DeliveryContract.prefixHash(901, config, all))
                .isEqualTo("e57dce6242b1f6e3d19191fe7bd9b90f311726f460600efcb93d9f8092c851e2");
        assertThat(BungeoppangV4DeliveryContract.prefixHash(901, config, delivery))
                .isEqualTo("1e3272b596241d6e6d6fc8b81d8172797ffa8b9fb1f829fb17a8c034c83175ca");

        // New two-minute rounds: same tuple chain, seed carries the new config version (values from the FE formula).
        String current = BungeoppangV5Spec.CONFIG_VERSION;
        assertThat(current).isEqualTo("v5-20261029.1");
        assertThat(BungeoppangV5Spec.initialPrefixHash(901, current))
                .isEqualTo("28808102872b82be26a1b4b0fd381d5fee8259a540c7a62b65937ef3bd153698");
        assertThat(BungeoppangV5DeliveryContract.prefixHash(901, current, delivery))
                .isEqualTo("620fb957a4a202fc24548d55ee239a0b8fb2ba26f7949414cba237bc9f6ffc4f");
        assertThat(BungeoppangV5DeliveryContract.prefixHash(901, current, all))
                .isEqualTo("be17157852ef0aa511292f59247cd71499494684dba367cd2d6a2b71bc94b141");
    }

    @Test
    void v5_로그는_버전과_3600건_한도로만_v4와_구분해_엄격하게_파싱한다() {
        var actions = new ArrayList<BungeoppangV4DeliveryDtos.Action>();
        for (int i = 0; i < 1_201; i++) {
            actions.add(new BungeoppangV4DeliveryDtos.Action(i + 1, "POUR", i * 50, 0, null, null, null, null));
        }
        String hash = BungeoppangV5DeliveryContract.prefixHash(901, BungeoppangV5Spec.CONFIG_VERSION, actions);
        JsonNode v5 = json.valueToTree(new BungeoppangV4DeliveryDtos.Request("v5", actions.size(), hash, actions));
        assertThat(BungeoppangV5DeliveryContract.parse(v5).log()).containsExactlyElementsOf(actions);
        assertThatThrownBy(() -> BungeoppangV4DeliveryContract.parse(v5)).isInstanceOf(MinigameException.class);

        JsonNode v4 = ((ObjectNode) v5.deepCopy()).put("rulesVersion", "v4");
        assertThatThrownBy(() -> BungeoppangV5DeliveryContract.parse(v4)).isInstanceOf(MinigameException.class);

        ObjectNode extra = v5.deepCopy();
        ((ObjectNode) extra.path("log").get(0)).put("heat", 100);
        assertThatThrownBy(() -> BungeoppangV5DeliveryContract.parse(extra)).isInstanceOf(MinigameException.class);
    }

    @Test
    void 시작_규칙은_FE_serviceV5가_검사하는_값과_필드를_가진다() {
        var rules = BungeoppangV5Spec.rules();
        JsonNode wire = json.valueToTree(rules);

        assertThat(rules.heatAssignment()).isEqualTo("FILL");
        assertThat(rules.maxActiveOrders()).isEqualTo(3);
        assertThat(List.of(rules.slots(), rules.durationMs(), rules.rushFromMs(), rules.trayCapacity(),
                rules.sideMs(), rules.rushSideMs(), rules.heatMin(), rules.heatMax(), rules.heatListLength(),
                rules.maxLogEntries(), rules.minGapMs(), rules.sameSlotGapMs()))
                .containsExactly(6, 120_000, 90_000, 10, 8_000, 6_000, 85, 115, 2_048, 3_600, 50, 300);
        // FE serviceV5 accepts exactly (120000, 90000) and the legacy (180000, 150000); nothing else differs.
        var legacy = BungeoppangV5Spec.legacyRules();
        assertThat(List.of(legacy.durationMs(), legacy.rushFromMs())).containsExactly(180_000, 150_000);
        assertThat(json.<JsonNode>valueToTree(legacy)).isEqualTo(((ObjectNode) wire.deepCopy())
                .put("durationMs", 180_000).put("rushFromMs", 150_000));
        for (String field : List.of("slots", "durationMs", "countdownMs", "sideMs", "rushSideMs", "rushFromMs",
                "heatMin", "heatMax", "heatListLength", "trayCapacity", "maxOrderItems",
                "specialOrderChancePercent", "specialBonusPercent", "okFrom", "goldenFrom", "goldenTo",
                "burntFrom", "okPoint", "goldenPoint", "pointsPerCoin", "dailyCoinCap", "minGapMs",
                "sameSlotGapMs", "maxLogEntries", "maxActiveOrders")) {
            assertThat(wire.path(field).isInt()).as(field).isTrue();
        }
        assertThat(wire.path("heatAssignment").textValue()).isEqualTo("FILL");
        assertThat(wire.path("firstOrder").path("bean").intValue()).isEqualTo(2);
    }

    @Test
    void checkpoint는_FE가_요구하는_필드와_반죽_placeholder를_유지한다() throws Exception {
        JsonNode fixture = fixture();
        var actions = BungeoppangV5DeliveryContract.domainActions(wire(fixture.path("log")).subList(0, 6));
        var result = new BungeoppangV5Rules().replay(actions, integers(fixture.path("heats")),
                orders(fixture.path("orders")), CURRENT);
        String hash = BungeoppangV5DeliveryContract.prefixHash(901, BungeoppangV5Spec.CONFIG_VERSION,
                wire(fixture.path("log")).subList(0, 6));

        JsonNode checkpoint = new ObjectMapper().valueToTree(BungeoppangV5Spec.checkpoint(2, 6, hash, result));

        assertThat(fieldNames(checkpoint)).containsExactlyInAnyOrder("revision", "throughSeq", "prefixHash",
                "heatCursor", "lastAt", "slots", "tray", "stats", "activeOrders");
        assertThat(checkpoint.path("slots")).hasSize(6);
        JsonNode batter = checkpoint.path("slots").get(1);
        assertThat(batter.path("phase").textValue()).isEqualTo("batter");
        assertThat(batter.path("since").intValue()).isZero();
        assertThat(batter.path("heat").intValue()).isEqualTo(100);
        assertThat(batter.path("filling").isNull()).isTrue();
        assertThat(batter.path("lastAt").intValue()).isEqualTo(14_900);
        assertThat(checkpoint.path("heatCursor").intValue()).isOne();
        assertThat(checkpoint.path("activeOrders")).hasSize(2);
        JsonNode order = checkpoint.path("activeOrders").get(1);
        assertThat(fieldNames(order)).containsExactlyInAnyOrder("orderId", "customerSlot", "availableAfterSeq",
                "items");
        assertThat(order.path("orderId").isTextual()).isTrue();
        assertThat(order.path("orderId").textValue()).isEqualTo("3");
        assertThat(order.path("customerSlot").intValue()).isEqualTo(2);
        assertThat(checkpoint.path("stats").path("customersServed").intValue()).isOne();
    }

    /**
     * The FE full-round files replayed with the rules snapshot their round stores: the unchanged three-minute file
     * with the legacy rules, the two-minute file with the new rules. Every delivery step and the final result
     * match the file. The BE MySQL test drives the same files through HTTP.
     */
    @ParameterizedTest(name = "{0}")
    @CsvSource({"bungeoppang-v5-2min-flow.json, false", "bungeoppang-v5-flow.json, true"})
    void FE_한판_fixture를_판의_저장_규칙으로_재계산하면_납품_단계와_최종_결과가_같다(String name, boolean legacy)
            throws Exception {
        JsonNode flow = flow(name);
        var snapshot = legacy ? BungeoppangV5Spec.legacyRules() : BungeoppangV5Spec.rules();
        var rules = BungeoppangV5Spec.calculationRules(snapshot);
        var heats = Collections.nCopies(2_048, flow.path("heat").intValue());
        var log = BungeoppangV5DeliveryContract.domainActions(wire(flow.path("log")));
        var history = orders(flow.path("orders"));

        for (JsonNode step : flow.path("deliveries")) {
            var delivered = new BungeoppangV5Rules().replay(log.subList(0, step.path("throughSeq").intValue()),
                    heats, history, rules);
            assertThat(delivered.score()).isEqualTo(step.path("score").longValue());
            assertThat(delivered.tray()).extracting(bread -> bread.breadId())
                    .containsExactlyElementsOf(longs(step.path("tray")));
            assertThat(delivered.activeOrders()).extracting(BungeoppangV5Rules.Order::orderId)
                    .containsExactlyElementsOf(texts(step.path("activeOrders")));
        }
        var result = new BungeoppangV5Rules().replay(log, heats, history, rules);
        JsonNode expected = flow.path("expected");
        assertThat(List.of(result.score(), (long) result.made(), (long) result.successfulMade(),
                (long) result.golden(), (long) result.failed(), (long) result.wasted(),
                (long) result.grillDiscarded(), (long) result.trayDiscarded(), (long) result.combo(),
                (long) result.maxCombo(), (long) result.served(), (long) result.customersServed(),
                (long) result.specialServed(), result.bonusScore(), (long) result.heatCursor(),
                result.score() / snapshot.pointsPerCoin()))
                .containsExactly(expected.path("score").longValue(), expected.path("made").longValue(),
                        expected.path("successfulMade").longValue(), expected.path("golden").longValue(),
                        expected.path("failed").longValue(), expected.path("wasted").longValue(),
                        expected.path("grillDiscarded").longValue(), expected.path("trayDiscarded").longValue(),
                        expected.path("combo").longValue(), expected.path("maxCombo").longValue(),
                        expected.path("served").longValue(), expected.path("customersServed").longValue(),
                        expected.path("specialServed").longValue(), expected.path("bonusScore").longValue(),
                        expected.path("fills").longValue(), expected.path("coinsCalculated").longValue());
        assertThat(result.tray()).isEmpty();
        assertThat(result.activeOrders()).extracting(BungeoppangV5Rules.Order::orderId)
                .containsExactlyElementsOf(texts(expected.path("activeOrders")));
    }

    @Test
    void 두_FE_한판_fixture는_가속_구간만_옮기고_같은_결과를_기대하며_판_규칙이_바뀌면_결과가_달라진다() throws Exception {
        JsonNode legacyFlow = flow("bungeoppang-v5-flow.json");
        JsonNode twoMinuteFlow = flow("bungeoppang-v5-2min-flow.json");
        for (String field : List.of("heat", "orders", "deliveryKeys", "deliveries", "expected")) {
            assertThat(twoMinuteFlow.path(field)).as(field).isEqualTo(legacyFlow.path(field));
        }
        // Same actions; only the ones from the legacy 150 s rush start move to the 90 s rush start.
        JsonNode legacyLog = legacyFlow.path("log");
        JsonNode twoMinuteLog = twoMinuteFlow.path("log");
        assertThat(twoMinuteLog).hasSameSizeAs(legacyLog);
        for (int i = 0; i < legacyLog.size(); i++) {
            int t = legacyLog.get(i).path("t").intValue();
            ObjectNode moved = ((ObjectNode) legacyLog.get(i).deepCopy()).put("t", t >= 150_000 ? t - 60_000 : t);
            assertThat(twoMinuteLog.get(i)).as("log %d", i).isEqualTo(moved);
        }

        var heats = Collections.nCopies(2_048, 100);
        var current = BungeoppangV5Spec.calculationRules(BungeoppangV5Spec.rules());
        var legacy = BungeoppangV5Spec.calculationRules(BungeoppangV5Spec.legacyRules());
        // A three-minute log is outside a new round: its first action at 150 s is rejected.
        assertThatThrownBy(() -> new BungeoppangV5Rules().replay(
                BungeoppangV5DeliveryContract.domainActions(wire(legacyLog)), heats,
                orders(legacyFlow.path("orders")), current))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.detail()).isEqualTo("BAD_ENTRY");
                    assertThat(error.index()).isEqualTo(18);
                });
        // Under the legacy rules 90 s is not rush yet, so the rush bread is no longer golden.
        var shiftedOnLegacy = new BungeoppangV5Rules().replay(
                BungeoppangV5DeliveryContract.domainActions(wire(twoMinuteLog)), heats,
                orders(twoMinuteFlow.path("orders")), legacy);
        assertThat(shiftedOnLegacy.golden()).isEqualTo(twoMinuteFlow.path("expected").path("golden").intValue() - 1);
    }

    private JsonNode flow(String name) throws Exception {
        Path path = FIXTURE.resolveSibling(name);
        assertThat(path).as("FE 공통 한판 fixture는 저장소의 frontend 폴더에 있어야 합니다.").exists();
        return json.readTree(Files.readString(path));
    }

    private static List<Long> longs(JsonNode values) {
        var result = new ArrayList<Long>();
        values.forEach(value -> result.add(value.longValue()));
        return result;
    }

    private static List<String> texts(JsonNode values) {
        var result = new ArrayList<String>();
        values.forEach(value -> result.add(value.textValue()));
        return result;
    }

    private JsonNode fixture() throws Exception {
        assertThat(FIXTURE).as("FE 공통 fixture는 저장소의 frontend 폴더에 있어야 합니다.").exists();
        return json.readTree(Files.readString(FIXTURE));
    }

    /** Mirrors the FE serviceV5 wire mapping: seq from position, DELIVER carries its delivery key. */
    private static List<BungeoppangV4DeliveryDtos.Action> wire(JsonNode log) {
        var actions = new ArrayList<BungeoppangV4DeliveryDtos.Action>();
        for (JsonNode entry : log) {
            String action = entry.path("action").textValue();
            int seq = actions.size() + 1;
            int t = entry.path("t").intValue();
            actions.add(switch (action) {
                case "DELIVER" -> new BungeoppangV4DeliveryDtos.Action(seq, action, t, null, null, null,
                        entry.path("orderId").textValue(), DELIVERY_KEY);
                case "TRAY_DISCARD" -> new BungeoppangV4DeliveryDtos.Action(seq, action, t, null, null,
                        entry.path("breadId").longValue(), null, null);
                default -> new BungeoppangV4DeliveryDtos.Action(seq, action, t, entry.path("slot").intValue(),
                        "FILL".equals(action) ? entry.path("filling").textValue() : null, null, null, null);
            });
        }
        return actions;
    }

    private static List<Integer> integers(JsonNode values) {
        var result = new ArrayList<Integer>();
        values.forEach(value -> result.add(value.intValue()));
        return result;
    }

    private static List<BungeoppangV5Rules.Order> orders(JsonNode values) {
        var result = new ArrayList<BungeoppangV5Rules.Order>();
        for (JsonNode order : values) {
            JsonNode items = order.path("items");
            result.add(new BungeoppangV5Rules.Order(order.path("orderId").textValue(),
                    order.path("customerSlot").intValue(), order.path("availableAfterSeq").intValue(),
                    new FillingCounts(items.path("bean").intValue(), items.path("custard").intValue(),
                            items.path("pizza").intValue(), items.path("chocolate").intValue())));
        }
        return result;
    }

    private static Set<String> fieldNames(JsonNode node) {
        var names = new java.util.HashSet<String>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }
}
