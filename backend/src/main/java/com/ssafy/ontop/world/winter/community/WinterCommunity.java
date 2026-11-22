package com.ssafy.ontop.world.winter.community;

import java.util.List;
import java.util.Set;

/** 공개 상태에는 계정별 저장 키·중복 방지 키를 포함하지 않는다. */
public final class WinterCommunity {
    public static final int TREE_TARGET = 50;
    public static final Set<String> TREE_ORNAMENTS = Set.of("STOCKING", "BAUBLE", "BELL", "GIFT");

    private WinterCommunity() { }

    public record TreeOrnament(long id, String ornament) { }
    public record TreeStatus(long count, boolean lit, String litAt, long revision, List<TreeOrnament> ornaments) { }
    public record TreeMessage(long id, String text, boolean anonymous, String nickname, String ornament,
            String createdAt) { }
    public record TreePage(TreeStatus status, List<TreeMessage> messages, Long nextBefore) { }
    public record TreeReceipt(TreeStatus status, TreeMessage message, String nextAllowedAt) { }
    public record Player(String userId, String nickname, double x, double y, double z, boolean free) { }
}
