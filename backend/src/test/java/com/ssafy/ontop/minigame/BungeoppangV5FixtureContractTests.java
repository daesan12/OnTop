package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.service.BungeoppangV4DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts;
import com.ssafy.ontop.minigame.service.BungeoppangV5DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV5Rules;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.minigame.service.MinigameException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The FE common fixture is read in place so a contract change on either side fails this test. */
class BungeoppangV5FixtureContractTests {
    private static final Path FIXTURE = Path.of("..", "frontend", "tests", "fixtures", "bungeoppang-v5.json");
    private static final String DELIVERY_KEY = "delivery-two";
    private final ObjectMapper json = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);

    @Test
    void FE_공통_fixture를_같은_행동_로그로_재계산하면_기대_결과와_같다() throws Exception {
        JsonNode fixture = fixture();
        JsonNode expected = fixture.path("expected");

        var result = new BungeoppangV5Rules().replay(
                BungeoppangV5DeliveryContract.domainActions(wire(fixture.path("log"))),
                integers(fixture.path("heats")), orders(fixture.path("orders")));

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
        String config = BungeoppangV5Spec.CONFIG_VERSION;

        assertThat(config).isEqualTo("v5-20261027.1").isNotEqualTo("v4-20261027.1");
        assertThat(BungeoppangV5Spec.initialPrefixHash(901))
                .isEqualTo("7ac7c529cf10bc98977c5c7676d8b295f8ceb682857bb5727ffe6953470e1876");
        assertThat(BungeoppangV5DeliveryContract.prefixHash(901, config, delivery))
                .isEqualTo("a2793d12d244a95dd6410b1f8219406e6b86074bca1fc9f42bd56686002f9850");
        assertThat(BungeoppangV5DeliveryContract.prefixHash(901, config, all))
                .isEqualTo("e57dce6242b1f6e3d19191fe7bd9b90f311726f460600efcb93d9f8092c851e2");
        assertThat(BungeoppangV4DeliveryContract.prefixHash(901, config, delivery))
                .isEqualTo("1e3272b596241d6e6d6fc8b81d8172797ffa8b9fb1f829fb17a8c034c83175ca");
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
                .containsExactly(6, 180_000, 150_000, 10, 8_000, 6_000, 85, 115, 2_048, 3_600, 50, 300);
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
                orders(fixture.path("orders")));
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
