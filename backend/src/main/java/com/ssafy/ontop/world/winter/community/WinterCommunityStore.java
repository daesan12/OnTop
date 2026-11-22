package com.ssafy.ontop.world.winter.community;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** 실제 DB 저장과 루프백 검수 저장소를 분리한다. 멱등성·점등 카운터는 저장소 트랜잭션에서 확정한다. */
public interface WinterCommunityStore {
    byte[] actorSalt();
    WinterCommunity.TreeStatus treeStatus();
    WinterCommunity.TreePage tree(Long before, int limit);
    WinterCommunity.TreeReceipt postTree(String actorKey, String operation, String text, boolean anonymous,
            String nickname, String ornament, Instant now);
    List<WinterCommunity.Snowman> snowmen(String channel);
    Optional<WinterCommunity.Snowman> previousSnowman(String actorKey, String operation, String requestHash);
    WinterCommunity.Snowman saveSnowman(String actorKey, String operation, String requestHash,
            WinterCommunity.Snowman snowman);
}
