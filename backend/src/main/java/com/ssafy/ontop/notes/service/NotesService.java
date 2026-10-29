package com.ssafy.ontop.notes.service;

import com.ssafy.ontop.notes.config.NotesProperties;
import com.ssafy.ontop.notes.domain.AnonymousNote;
import com.ssafy.ontop.notes.domain.NoteRequest;
import com.ssafy.ontop.notes.domain.NoteText;
import com.ssafy.ontop.notes.dto.NoteListResponse;
import com.ssafy.ontop.notes.dto.NoteReceiptResponse;
import com.ssafy.ontop.notes.dto.NoteResponse;
import com.ssafy.ontop.notes.repository.NotesRepository;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public class NotesService {
    private final NotesRepository repository;
    private final TransactionTemplate transactions;
    private final TableHub hub;
    private final NotesProperties properties;
    private final NotePrivacy privacy;
    private final Clock clock;
    private final java.util.function.LongConsumer changed;

    public NotesService(NotesRepository repository, PlatformTransactionManager manager, TableHub hub,
            NotesProperties properties, Clock clock) {
        this(repository, manager, hub, properties, clock, ignored -> {});
    }

    public NotesService(NotesRepository repository, PlatformTransactionManager manager, TableHub hub,
            NotesProperties properties, Clock clock, java.util.function.LongConsumer changed) {
        this.repository = repository;
        transactions = new TransactionTemplate(manager);
        this.hub = hub;
        this.properties = properties;
        privacy = new NotePrivacy(properties.privacySecret());
        this.clock = clock;
        this.changed = changed;
    }

    public NoteReceiptResponse submit(long user, String key, String channel, NoteText text) {
        return submit(user, key, channel, text, com.ssafy.ontop.notes.domain.NoteCategory.FREE);
    }

    public NoteReceiptResponse submit(long user, String key, String channel, NoteText text,
            com.ssafy.ontop.notes.domain.NoteCategory category) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            member(user);
            access(user, channel);
            repository.lockBoard();
            Instant now = now();
            Instant keyTime = keyTime(key, now);
            String requestDigest = privacy.digest("request", user + ":" + key);
            // free는 기존 24시간 영수증의 HMAC과 호환한다.
            String bodyDigest = category.equals(com.ssafy.ontop.notes.domain.NoteCategory.FREE)
                    ? privacy.digest("body", text.value())
                    : privacy.digest("body-category", category.value() + "\0" + text.value());
            var previous = repository.request(requestDigest);
            if (previous != null && now.isBefore(previous.expiresAt())) {
                if (!previous.bodyDigest().equals(bodyDigest)) {
                    throw new NoteException(409, "IDEMPOTENCY_CONFLICT", "같은 요청 키의 내용이 다릅니다.");
                }
                var note = repository.note(previous.noteId());
                if (note == null) {
                    throw new NoteException(410, "NOTE_REMOVED", "보관 범위에서 삭제된 메모입니다. 다시 게시하지 않습니다.");
                }
                return new NoteReceiptResponse(NoteResponse.from(note), previous.acceptedAt().plusSeconds(15));
            }
            var rate = repository.rate(privacy.digest("rate", Long.toString(user)), now);
            checkAfter(rate.writeAfter(), now, "NOTES_WRITE_COOLDOWN");
            var note = new AnonymousNote(text, category, now);
            repository.save(note);
            // 키 검사와 같은 시각에 만료시켜 정리 직후에도 같은 키가 새 글이 되지 않게 한다.
            repository.saveRequest(new NoteRequest(requestDigest, bodyDigest, note.id(), now,
                    keyTime.plusSeconds(86400)));
            rate.write(now);
            repository.trim();
            long revision = repository.advanceRevision();
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override public void afterCommit() {
                            try { changed.accept(revision); }
                            catch (RuntimeException failure) {
                                org.slf4j.LoggerFactory.getLogger(NotesService.class).warn("메모 변경 알림 지연 type={}",
                                        failure.getClass().getSimpleName());
                            }
                        }
                    });
            return new NoteReceiptResponse(NoteResponse.from(note), now.plusSeconds(15));
        }));
    }

    public NoteListResponse list(long user, String channel) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            member(user);
            access(user, channel);
            Instant now = now();
            var rate = repository.rate(privacy.digest("rate", Long.toString(user)), now);
            checkAfter(rate.readAfter(), now, "NOTES_READ_COOLDOWN");
            rate.read(now);
            return new NoteListResponse(repository.list().stream().map(NoteResponse::from).toList());
        }));
    }

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    public void purgeMetadata() {
        transactions.executeWithoutResult(transaction -> {
            repository.lockBoard();
            repository.purgeMetadata(now());
        });
    }

    private Instant keyTime(String key, Instant now) {
        if (key == null || !key.matches("[0-9]{13}_[A-Za-z0-9_-]{16,64}")) {
            throw new NoteException(400, "INVALID_REQUEST", "operationId는 발급시각ms_임의키 형식입니다.");
        }
        Instant issued = Instant.ofEpochMilli(Long.parseLong(key.substring(0, 13)));
        if (!now.isBefore(issued.plusSeconds(86400))) {
            throw new NoteException(410, "NOTES_REQUEST_EXPIRED", "재확인 가능 시간이 지났습니다. 자동 재게시하지 마세요.");
        }
        if (issued.isAfter(now)) {
            throw new NoteException(400, "INVALID_REQUEST", "기기의 시각을 확인해주세요.");
        }
        return issued;
    }

    private void member(long id) {
        if (!repository.lockMember(id)) {
            throw new NoteException(401, "UNAUTHENTICATED", "활성 회원 로그인이 필요합니다.");
        }
    }

    private void access(long user, String channel) {
        hub.requireNotesAccess(user, channel, properties.x(), properties.y(), properties.z());
    }

    private void checkAfter(Instant next, Instant now, String code) {
        if (next != null && now.isBefore(next)) {
            throw new NoteException(429, code, "잠시 후 다시 시도해주세요.", next);
        }
    }

    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
}
