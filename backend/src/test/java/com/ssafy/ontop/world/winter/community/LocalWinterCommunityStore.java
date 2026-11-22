package com.ssafy.ontop.world.winter.community;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

/** 테스트 classpath 전용. JDBC·운영 DB 검증을 대신하지 않는 파일 기반 로컬 검수 기록이다. */
public final class LocalWinterCommunityStore implements WinterCommunityStore {
    public record Letter(String actor, String operation, WinterCommunity.TreeMessage message) { }
    public record Data(String salt, List<Letter> letters) { }
    private final ObjectMapper mapper = new ObjectMapper();
    private final Path path;
    private final byte[] salt;
    private final List<Letter> letters = new ArrayList<>();

    public LocalWinterCommunityStore(Path path, int initialLetters) {
        this.path = path;
        try {
            if (path != null && Files.exists(path)) {
                var data = mapper.readValue(path.toFile(), Data.class);
                salt = HexFormat.of().parseHex(data.salt());
                letters.addAll(data.letters());
            } else {
                salt = new byte[32]; new SecureRandom().nextBytes(salt);
                for (int i = 1; i <= initialLetters; i++) {
                    letters.add(new Letter("qa-seed-" + i, "seed-" + i, new WinterCommunity.TreeMessage(i,
                            "[로컬 검수용 편지] 함께한 겨울을 응원해요 " + i, true, null, "BAUBLE",
                            Instant.parse("2026-11-20T00:00:00Z").plusSeconds(i * 16L).toString())));
                }
                persist();
            }
        } catch (IOException failure) { throw new IllegalStateException("로컬 겨울 검수 기록 읽기 실패", failure); }
    }

    private void persist() {
        if (path == null) { return; }
        try {
            Files.createDirectories(path.toAbsolutePath().getParent());
            Path temporary = path.resolveSibling(path.getFileName() + ".tmp");
            mapper.writeValue(temporary.toFile(), new Data(HexFormat.of().formatHex(salt), List.copyOf(letters)));
            Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException failure) { throw new IllegalStateException("로컬 겨울 검수 기록 저장 실패", failure); }
    }

    @Override public byte[] actorSalt() { return salt.clone(); }
    @Override public synchronized WinterCommunity.TreeStatus treeStatus() {
        String lit = letters.size() >= WinterCommunity.TREE_TARGET
                ? letters.get(WinterCommunity.TREE_TARGET - 1).message().createdAt() : null;
        var ornaments = letters.stream().map(Letter::message)
                .sorted(Comparator.comparingLong(WinterCommunity.TreeMessage::id).reversed()).limit(50)
                .map(letter -> new WinterCommunity.TreeOrnament(letter.id(), letter.ornament())).toList();
        return new WinterCommunity.TreeStatus(letters.size(), lit != null, lit, letters.size(), ornaments);
    }
    @Override public synchronized WinterCommunity.TreePage tree(Long before, int limit) {
        var page = letters.stream().map(Letter::message).filter(m -> before == null || m.id() < before)
                .sorted(Comparator.comparingLong(WinterCommunity.TreeMessage::id).reversed()).limit(limit + 1L).toList();
        return new WinterCommunity.TreePage(treeStatus(), page.stream().limit(limit).toList(),
                page.size() > limit ? page.get(limit - 1).id() : null);
    }
    @Override public synchronized WinterCommunity.TreeReceipt postTree(String actor, String operation, String text,
            boolean anonymous, String nickname, String ornament, Instant now) {
        var previous = letters.stream().filter(l -> l.actor().equals(actor) && l.operation().equals(operation)).findFirst();
        if (previous.isPresent()) {
            var m = previous.get().message();
            if (!m.text().equals(text) || m.anonymous() != anonymous || !m.ornament().equals(ornament)) { conflict(); }
            return new WinterCommunity.TreeReceipt(treeStatus(), m, Instant.parse(m.createdAt()).plusSeconds(15).toString());
        }
        var latest = letters.stream().filter(l -> l.actor().equals(actor)).map(l -> Instant.parse(l.message().createdAt())).max(Comparator.naturalOrder());
        if (latest.isPresent() && now.isBefore(latest.get().plusSeconds(15))) {
            throw new WinterCommunityException(429, "WINTER_MESSAGE_COOLDOWN", "새 편지는 15초 뒤에 남겨주세요.");
        }
        var m = new WinterCommunity.TreeMessage(letters.size() + 1L, text, anonymous, anonymous ? null : nickname,
                ornament, now.toString());
        letters.add(new Letter(actor, operation, m)); persist();
        return new WinterCommunity.TreeReceipt(treeStatus(), m, now.plusSeconds(15).toString());
    }
    private static void conflict() { throw new WinterCommunityException(409, "WINTER_OPERATION_CONFLICT", "같은 요청의 내용이 달라졌어요."); }
}
