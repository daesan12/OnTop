package com.ssafy.ontop.auth.repository;

import com.ssafy.ontop.auth.domain.RefreshToken;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    // AUTH-03/04는 호출자 트랜잭션 안에서 유효성 판정·폐기·다음 토큰 저장을 원자적으로 수행해야 한다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RefreshToken r where r.tokenHash = :hash")
    Optional<RefreshToken> findForUpdateByHash(@Param("hash") String hash);

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    // 먼저 user를 잠근 뒤 Refresh를 잠근다. 잠금 전 엔티티를 읽어 1차 캐시에 남기지 않는다.
    @Query("select r.user.id as userId, r.rotatedAt as rotatedAt from RefreshToken r where r.tokenHash = :hash")
    Optional<TokenReference> findReferenceByTokenHash(@Param("hash") String hash);

    interface TokenReference {
        Long getUserId();

        Instant getRotatedAt();
    }

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken r set r.revokedAt = :now where r.user.id = :userId "
            + "and r.sessionId = :sessionId and r.revokedAt is null")
    int revokeSession(@Param("userId") Long userId, @Param("sessionId") String sessionId, @Param("now") Instant now);
}
