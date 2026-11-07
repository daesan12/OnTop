package com.ssafy.ontop.notification.repository;

import com.ssafy.ontop.feedback.domain.FeedbackReply;
import com.ssafy.ontop.notification.domain.PersonalNotification;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

public class NotificationRepository {
    private final EntityManager entities;

    public NotificationRepository(EntityManager entities) { this.entities = entities; }

    public Optional<FeedbackReply> reply(String id) {
        return Optional.ofNullable(entities.find(FeedbackReply.class, id));
    }

    public void save(FeedbackReply reply, PersonalNotification notification) {
        entities.persist(reply);
        entities.persist(notification);
        entities.flush();
    }

    public Optional<PersonalNotification> byReply(long userId, String replyId) {
        return entities.createQuery("select n from PersonalNotification n where n.userId = :user"
                        + " and n.replyId = :reply", PersonalNotification.class)
                .setParameter("user", userId).setParameter("reply", replyId).getResultStream().findFirst();
    }

    public List<PersonalNotification> list(long userId, long before, int limit, Instant now) {
        return entities.createQuery("select n from PersonalNotification n where n.userId = :user"
                        + " and n.id < :before and n.expiresAt > :now order by n.id desc", PersonalNotification.class)
                .setParameter("user", userId).setParameter("before", before).setParameter("now", now)
                .setMaxResults(limit).getResultList();
    }

    public long unread(long userId, Instant now) {
        return entities.createQuery("select count(n) from PersonalNotification n where n.userId = :user"
                        + " and n.readAt is null and n.expiresAt > :now", Long.class)
                .setParameter("user", userId).setParameter("now", now).getSingleResult();
    }

    public Optional<PersonalNotification> owned(long userId, long id, Instant now) {
        return entities.createQuery("select n from PersonalNotification n where n.userId = :user"
                        + " and n.id = :id and n.expiresAt > :now", PersonalNotification.class)
                .setParameter("user", userId).setParameter("id", id).setParameter("now", now)
                .getResultStream().findFirst();
    }

    public Map<Long, FeedbackReply> latestReplies(Set<Long> ids) {
        if (ids.isEmpty()) { return Map.of(); }
        return entities.createQuery("select r from FeedbackReply r where r.feedbackId in :ids and not exists"
                        + " (select r2.id from FeedbackReply r2 where r2.feedbackId = r.feedbackId and"
                        + " (r2.createdAt > r.createdAt or (r2.createdAt = r.createdAt and r2.id > r.id)))",
                        FeedbackReply.class)
                .setParameter("ids", ids).getResultList().stream()
                .collect(Collectors.toMap(FeedbackReply::feedbackId, Function.identity()));
    }

    public void flush() { entities.flush(); }
}
