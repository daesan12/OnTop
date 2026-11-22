package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.notes.domain.NoteText;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.UUID;
import java.util.function.Supplier;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** 트리 편지의 권한은 공원에서, 멱등성과 점등은 저장소에서 검증한다. */
public final class WinterCommunityService {
    private final Supplier<WinterCommunityStore> stores;
    private final WinterWorld world;
    private final Clock clock;

    public WinterCommunityService(Supplier<WinterCommunityStore> stores, WinterWorld world, Clock clock) {
        this.stores = stores;
        this.world = world;
        this.clock = clock;
    }

    private WinterCommunityStore store() {
        var store = stores.get();
        if (store == null) {
            throw new WinterCommunityException(503, "WINTER_STORAGE_UNAVAILABLE", "겨울 공원 기록을 연결하지 못했어요.");
        }
        return store;
    }

    private static String operation(String value) {
        try { return UUID.fromString(value).toString(); }
        catch (IllegalArgumentException | NullPointerException failure) {
            throw new WinterCommunityException(400, "WINTER_OPERATION_INVALID", "등록 요청을 다시 확인해주세요.");
        }
    }

    private String actorKey(long user, String purpose) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(store().actorSalt(), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((purpose + ":" + user).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("겨울 기록 식별 키 생성 실패", failure);
        }
    }

    public WinterCommunity.TreeStatus treeStatus(long user, String channel) {
        world.player(user, channel);
        return store().treeStatus();
    }

    public WinterCommunity.TreePage tree(long user, String channel, Long before) {
        var player = world.player(user, channel);
        world.requireTree(player, channel);
        if (before != null && before <= 0) {
            throw new WinterCommunityException(400, "WINTER_CURSOR_INVALID", "편지 목록을 다시 열어주세요.");
        }
        return store().tree(before, 12);
    }

    public WinterCommunity.TreeReceipt postTree(long user, String channel, String request, String text,
            Boolean anonymous, String ornament) {
        var player = world.player(user, channel);
        world.requireTree(player, channel);
        requireFree(player);
        if (anonymous == null) {
            throw new WinterCommunityException(400, "WINTER_VISIBILITY_REQUIRED", "익명 또는 닉네임 공개를 선택해주세요.");
        }
        if (ornament == null || !WinterCommunity.TREE_ORNAMENTS.contains(ornament)) {
            throw new WinterCommunityException(400, "WINTER_ORNAMENT_REQUIRED", "트리에 걸 장식을 먼저 골라주세요.");
        }
        var body = new NoteText(text);
        if (!anonymous && (player.nickname() == null || player.nickname().isBlank())) {
            throw new WinterCommunityException(409, "WINTER_PROFILE_LOADING", "닉네임을 불러오는 중이에요. 잠시 후 다시 남겨주세요.");
        }
        var receipt = store().postTree(actorKey(user, "tree"), operation(request), body.value(), anonymous,
                anonymous ? null : player.nickname(), ornament, clock.instant());
        world.publishTree(receipt.status());
        return receipt;
    }

    private static void requireFree(WinterCommunity.Player player) {
        if (!player.free()) {
            throw new WinterCommunityException(409, "WINTER_ACTIVITY_CONFLICT", "공원 바닥에서 다른 활동을 마친 뒤 이용해주세요.");
        }
    }

}
