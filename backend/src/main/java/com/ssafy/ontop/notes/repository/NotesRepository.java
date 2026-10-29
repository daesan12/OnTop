package com.ssafy.ontop.notes.repository;

import com.ssafy.ontop.notes.domain.AnonymousNote;
import com.ssafy.ontop.notes.domain.NoteBoard;
import com.ssafy.ontop.notes.domain.NoteRateLimit;
import com.ssafy.ontop.notes.domain.NoteRequest;
import com.ssafy.ontop.user.domain.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;

public class NotesRepository {
    private final EntityManager entities;

    public NotesRepository(EntityManager entities) {
        this.entities = entities;
    }

    public boolean lockMember(long id) {
        var user = entities.find(User.class, id, LockModeType.PESSIMISTIC_WRITE);
        if (user == null) {
            return false;
        }
        entities.refresh(user, LockModeType.PESSIMISTIC_WRITE);
        return user.getDeletedAt() == null;
    }

    public void lockBoard() {
        if (entities.find(NoteBoard.class, 1L, LockModeType.PESSIMISTIC_WRITE) == null) {
            throw new IllegalStateException("익명 메모 게시판 초기 행이 없습니다.");
        }
    }

    public NoteRequest request(String digest) { return entities.find(NoteRequest.class, digest); }
    public AnonymousNote note(long id) { return entities.find(AnonymousNote.class, id); }

    public NoteRateLimit rate(String digest, Instant now) {
        var rate = entities.find(NoteRateLimit.class, digest);
        if (rate == null) {
            rate = new NoteRateLimit(digest, now);
            entities.persist(rate);
        }
        return rate;
    }

    public void save(AnonymousNote note) { entities.persist(note); entities.flush(); }
    public void saveRequest(NoteRequest request) { entities.persist(request); entities.flush(); }

    public long revision() {
        return entities.createQuery("select b.revision from NoteBoard b where b.id=1", Long.class).getSingleResult();
    }

    public long advanceRevision() {
        int changed = entities.createQuery("update NoteBoard b set b.revision=b.revision+1 where b.id=1 and b.revision<:maximum")
                .setParameter("maximum", Long.MAX_VALUE).executeUpdate();
        if (changed != 1) { throw new IllegalStateException("메모 변경 번호를 확정할 수 없습니다."); }
        return revision();
    }

    public List<AnonymousNote> list() {
        return entities.createQuery("select n from AnonymousNote n order by n.createdAt desc, n.id desc",
                AnonymousNote.class).setMaxResults(120).getResultList();
    }

    public void trim() {
        var ids = entities.createQuery("select n.id from AnonymousNote n order by n.createdAt desc, n.id desc",
                Long.class).setFirstResult(120).getResultList();
        if (!ids.isEmpty()) {
            entities.createQuery("delete from AnonymousNote n where n.id in :ids")
                    .setParameter("ids", ids).executeUpdate();
        }
    }

    public void purgeMetadata(Instant now) {
        entities.createQuery("delete from NoteRequest r where r.expiresAt <= :now").setParameter("now", now)
                .executeUpdate();
        entities.createQuery("delete from NoteRateLimit r where r.expiresAt <= :now").setParameter("now", now)
                .executeUpdate();
    }
}
