package com.ssafy.ontop.notes.service;

import com.ssafy.ontop.notes.repository.NotesRepository;
import com.ssafy.ontop.table.service.TableHub;
import jakarta.annotation.PostConstruct;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 전 인스턴스가 공유 DB의 커밋된 revision을 확인한다. FE 정기 GET/신규 인프라는 없다. */
public final class NotesChangeNotifier {
    private final NotesRepository repository;
    private final TransactionTemplate reads;
    private final TableHub hub;
    private long seen;

    public NotesChangeNotifier(NotesRepository repository, PlatformTransactionManager manager, TableHub hub) {
        this.repository = repository; this.hub = hub;
        reads = new TransactionTemplate(manager);
        reads.setReadOnly(true);
        reads.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @PostConstruct
    public void initialize() { seen = read(); }

    private long read() { return java.util.Objects.requireNonNull(reads.execute(ignored -> repository.revision())); }

    public synchronized void committed(long revision) {
        if (revision <= seen) { return; }
        hub.notesChanged(revision);
        seen = revision;
    }

    @Scheduled(fixedDelay = 1000, initialDelay = 1000)
    public void reconcile() {
        try { committed(read()); }
        catch (RuntimeException failure) {
            org.slf4j.LoggerFactory.getLogger(NotesChangeNotifier.class).warn("메모 변경 번호 확인 지연 type={}",
                    failure.getClass().getSimpleName());
        }
    }
}
