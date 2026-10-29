package com.ssafy.ontop.ranking.service;

import com.ssafy.ontop.ranking.dto.BungeoppangRankingPage;
import com.ssafy.ontop.ranking.dto.BungeoppangRankingPage.Item;
import com.ssafy.ontop.ranking.exception.BungeoppangRankingException;
import com.ssafy.ontop.ranking.repository.BungeoppangRankingRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

/** 첫 페이지는 항상 새 DB 조회다. 후속 페이지만 같은 불변 스냅샷을 읽는다. */
@Service
public class BungeoppangRankingService {
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();
    private final ObjectProvider<BungeoppangRankingRepository> repositories;
    private final Clock clock;
    private final Duration ttl;
    private final byte[] key = new byte[32];
    private final Map<String, Snapshot> snapshots = new LinkedHashMap<>();
    private record Snapshot(String id, long user, String rules, int limit, Instant at, Instant until,
            List<Item> items, Item me) { }

    @Autowired
    public BungeoppangRankingService(ObjectProvider<BungeoppangRankingRepository> repositories,
            @Value("${ontop.rankings.bungeoppang.snapshot-ttl:2m}") Duration ttl) {
        this(repositories, Clock.systemUTC(), ttl);
    }
    public BungeoppangRankingService(ObjectProvider<BungeoppangRankingRepository> repositories, Clock clock, Duration ttl) {
        if (ttl.compareTo(Duration.ofSeconds(1)) < 0 || ttl.compareTo(Duration.ofMinutes(5)) > 0) {
            throw new IllegalArgumentException("랭킹 스냅샷 보관 시간은1초~5분입니다.");
        }
        this.repositories = repositories; this.clock = clock; this.ttl = ttl;
        new SecureRandom().nextBytes(key);
    }

    public BungeoppangRankingPage find(long user, String period, String rules, String requestedLimit, String cursor) {
        require(user > 0, 401, "AUTH_REQUIRED", "로그인이 필요합니다.");
        require("ALL_TIME".equals(period), 400, "RANKING_INVALID_PERIOD", "전체 기간만 조회할 수 있습니다.");
        require("v4".equals(rules) || "v5".equals(rules), 400, "RANKING_INVALID_RULES_VERSION", "v4 또는 v5를 지정해주세요.");
        require(requestedLimit != null && requestedLimit.matches("[0-9]{1,2}"), 400, "INVALID_LIMIT", "조회 개수는1~20입니다.");
        int limit = Integer.parseInt(requestedLimit);
        require(limit >= 1 && limit <= 20, 400, "INVALID_LIMIT", "조회 개수는1~20입니다.");
        if (cursor != null) { return pageFromCursor(user, rules, limit, cursor); }
        var repository = repositories.getIfAvailable();
        require(repository != null, 503, "RANKING_UNAVAILABLE", "랭킹 저장소가 준비되지 않았습니다.");
        List<Item> items;
        try { items = List.copyOf(repository.personalBests(rules)); }
        catch (DataAccessException | TransactionException exception) {
            throw new BungeoppangRankingException(503, "RANKING_UNAVAILABLE", "랭킹을 불러오지 못했습니다.");
        }
        require(items.size() <= 10_000, 503, "RANKING_TOO_LARGE", "조회 가능한 랭킹 크기를 초과했습니다.");
        Instant now = clock.instant();
        var snapshot = new Snapshot(UUID.randomUUID().toString(), user, rules, limit, now, now.plus(ttl), items,
                items.stream().filter(item -> item.userId().equals(Long.toString(user))).findFirst().orElse(null));
        synchronized (snapshots) {
            prune(now);
            while (snapshots.size() >= 128 || storedRows() + items.size() > 100_000) {
                snapshots.remove(snapshots.keySet().iterator().next());
            }
            snapshots.put(snapshot.id, snapshot);
            return page(snapshot, 0);
        }
    }

    private BungeoppangRankingPage pageFromCursor(long user, String rules, int limit, String cursor) {
        require(cursor.length() <= 512, 400, "INVALID_CURSOR", "커서를 확인해주세요.");
        String id;
        int offset;
        byte[] payload;
        byte[] signature;
        try {
            String[] parts = cursor.split("\\.", -1);
            if (parts.length != 2) { throw new IllegalArgumentException(); }
            payload = DECODER.decode(parts[0]);
            signature = DECODER.decode(parts[1]);
            String[] body = new String(payload, StandardCharsets.US_ASCII).split(":", -1);
            if (body.length != 2) { throw new IllegalArgumentException(); }
            id = UUID.fromString(body[0]).toString(); offset = Integer.parseInt(body[1]);
        } catch (IllegalArgumentException exception) {
            throw new BungeoppangRankingException(400, "INVALID_CURSOR", "커서를 확인해주세요.");
        }
        synchronized (snapshots) {
            prune(clock.instant());
            Snapshot snapshot = snapshots.get(id);
            require(snapshot != null && snapshot.user == user && snapshot.rules.equals(rules) && snapshot.limit == limit,
                    409, "RANKING_SNAPSHOT_EXPIRED", "랭킹을 처음부터 다시 조회해주세요.");
            require(MessageDigest.isEqual(sign(payload), signature), 400, "INVALID_CURSOR", "커서를 확인해주세요.");
            require(offset > 0 && offset < snapshot.items.size() && offset % limit == 0,
                    400, "INVALID_CURSOR", "커서를 확인해주세요.");
            return page(snapshot, offset);
        }
    }

    private BungeoppangRankingPage page(Snapshot snapshot, int offset) {
        int end = Math.min(snapshot.items.size(), offset + snapshot.limit);
        String cursor = null;
        if (end < snapshot.items.size()) {
            byte[] bytes = (snapshot.id + ":" + end).getBytes(StandardCharsets.US_ASCII);
            cursor = ENCODER.encodeToString(bytes) + "." + ENCODER.encodeToString(sign(bytes));
        }
        return new BungeoppangRankingPage(snapshot.rules, "ALL_TIME", "PERSONAL_BEST", snapshot.id,
                snapshot.at, snapshot.items.size(), snapshot.items.subList(offset, end), snapshot.me, cursor);
    }
    private byte[] sign(byte[] bytes) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(bytes);
        } catch (java.security.GeneralSecurityException exception) { throw new IllegalStateException("커서 서명을 만들지 못했습니다."); }
    }
    private void prune(Instant now) { snapshots.values().removeIf(snapshot -> !now.isBefore(snapshot.until)); }
    private long storedRows() { return snapshots.values().stream().mapToLong(s -> s.items.size()).sum(); }
    private static void require(boolean valid, int status, String code, String message) {
        if (!valid) { throw new BungeoppangRankingException(status, code, message); }
    }
}
