package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.service.BungeoppangV4DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV4Spec;
import com.ssafy.ontop.minigame.service.MinigameException;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BungeoppangV4DeliveryContractTests {
    private final ObjectMapper json = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);

    @Test
    void 계약서_D1_prefix_hash와_동일한_정규화를_사용한다() {
        var actions = actions("delivery-901-1");
        assertThat(BungeoppangV4DeliveryContract.prefixHash(901, BungeoppangV4Spec.CONFIG_VERSION, actions))
                .isEqualTo("3390310f411991a992eabfe657bc5022cb0d10fe4dcff34f1e33813164407d34");
    }

    @Test
    void 엄격한_action별_필드와_연속길이를_파싱한다() throws Exception {
        var actions = actions("delivery-901-1");
        String hash = BungeoppangV4DeliveryContract.prefixHash(901, BungeoppangV4Spec.CONFIG_VERSION, actions);
        var body = json.valueToTree(new BungeoppangV4DeliveryDtos.Request("v4", 9, hash, actions));

        assertThat(BungeoppangV4DeliveryContract.parse(body).log()).containsExactlyElementsOf(actions);
        ((com.fasterxml.jackson.databind.node.ObjectNode) body.path("log").get(0)).put("score", 100);
        assertThatThrownBy(() -> BungeoppangV4DeliveryContract.parse(body))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(400);
                    assertThat(error.index()).isZero();
                });
    }

    @Test
    void 중복_JSON_key와_계약외_로그크기를_거절한다() {
        byte[] duplicate = ("{\"rulesVersion\":\"v4\",\"rulesVersion\":\"v4\","
                + "\"throughSeq\":1,\"prefixHash\":\"" + "0".repeat(64)
                + "\",\"log\":[{\"seq\":1,\"action\":\"DELIVER\",\"t\":0,"
                + "\"orderId\":\"1\",\"deliveryKey\":\"one\"}]}")
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        assertThatThrownBy(() -> BungeoppangV4DeliveryContract.parse(duplicate))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.status()).isEqualTo(400));

        var actions = new java.util.ArrayList<BungeoppangV4DeliveryDtos.Action>();
        for (int i = 1; i <= 1_201; i++) {
            actions.add(new BungeoppangV4DeliveryDtos.Action(i, "POUR", i * 50, 0,
                    null, null, null, null));
        }
        var request = new BungeoppangV4DeliveryDtos.Request("v4", actions.size(), "0".repeat(64), actions);
        assertThatThrownBy(() -> BungeoppangV4DeliveryContract.parse(json.valueToTree(request)))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.status()).isEqualTo(400));
    }

    private List<BungeoppangV4DeliveryDtos.Action> actions(String key) {
        return List.of(
                new BungeoppangV4DeliveryDtos.Action(1, "POUR", 0, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(2, "FILL", 300, 0, "bean", null, null, null),
                new BungeoppangV4DeliveryDtos.Action(3, "TURN", 6700, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(4, "TURN", 13100, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(5, "POUR", 13200, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(6, "FILL", 13500, 1, "bean", null, null, null),
                new BungeoppangV4DeliveryDtos.Action(7, "TURN", 19900, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(8, "TURN", 26300, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(9, "DELIVER", 26400, null, null, null, "1", key));
    }
}
