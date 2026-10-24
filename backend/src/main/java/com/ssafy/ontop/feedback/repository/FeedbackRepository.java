package com.ssafy.ontop.feedback.repository;

import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.user.domain.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public class FeedbackRepository {
    private final EntityManager entities;

    public FeedbackRepository(EntityManager entities) {
        this.entities = entities;
    }

    public boolean lockActiveMember(long userId) {
        User user = entities.find(User.class, userId, LockModeType.PESSIMISTIC_WRITE);
        if (user == null) {
            return false;
        }
        entities.refresh(user, LockModeType.PESSIMISTIC_WRITE);
        return user.getDeletedAt() == null;
    }

    public Optional<FeedbackMessage> request(long userId, String key, Instant cutoff) {
        return entities.createQuery("select f from FeedbackMessage f where f.userId = :user"
                        + " and f.requestKey = :key and f.createdAt > :cutoff", FeedbackMessage.class)
                .setParameter("user", userId).setParameter("key", key).setParameter("cutoff", cutoff)
                .getResultList().stream().findFirst();
    }

    public Optional<Instant> latest(long userId) {
        return entities.createQuery("select f.createdAt from FeedbackMessage f where f.userId = :user"
                        + " order by f.createdAt desc", Instant.class)
                .setParameter("user", userId).setMaxResults(1).getResultList().stream().findFirst();
    }

    public void save(FeedbackMessage message) {
        entities.persist(message);
        entities.flush();
    }

    public List<FeedbackMessage> list(long beforeId, int limit, Instant cutoff) {
        return entities.createQuery("select f from FeedbackMessage f where f.id < :before"
                        + " and f.createdAt > :cutoff order by f.id desc", FeedbackMessage.class)
                .setParameter("before", beforeId).setParameter("cutoff", cutoff).setMaxResults(limit).getResultList();
    }

    public void detachAuthor(long userId) {
        entities.createQuery("update FeedbackMessage f set f.userId = null, f.requestKey = null where f.userId = :user")
                .setParameter("user", userId).executeUpdate();
    }

    public int deleteExpired(Instant cutoff) {
        return entities.createQuery("delete from FeedbackMessage f where f.createdAt <= :cutoff")
                .setParameter("cutoff", cutoff).executeUpdate();
    }

    public void deleteExpiredForMember(long userId, Instant cutoff) {
        entities.createQuery("delete from FeedbackMessage f where f.userId = :user and f.createdAt <= :cutoff")
                .setParameter("user", userId).setParameter("cutoff", cutoff).executeUpdate();
    }
}
