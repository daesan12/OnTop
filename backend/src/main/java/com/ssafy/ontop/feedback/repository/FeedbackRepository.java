package com.ssafy.ontop.feedback.repository;

import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.user.domain.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
        // 탈퇴한 회원은 개인 메시지 수신자가 될 수 없다. 기존 의견 본문은 보관 정책을 유지한다.
        entities.createQuery("delete from PersonalNotification n where n.userId = :user")
                .setParameter("user", userId).executeUpdate();
        entities.createQuery("update FeedbackMessage f set f.userId = null, f.requestKey = null where f.userId = :user")
                .setParameter("user", userId).executeUpdate();
    }

    public Optional<FeedbackMessage> find(long id, boolean lock) {
        // 최초 수신자 조회로 영속성 컨텍스트에 남은 이전 버전에 잠금을 걸면 Hibernate가
        // 최신 행을 읽기 전에 낙관적 잠금 예외를 낸다. refresh가 최신 값과 잠금을 함께 가져온다.
        FeedbackMessage message = entities.find(FeedbackMessage.class, id);
        if (message != null && lock) { entities.refresh(message, LockModeType.PESSIMISTIC_WRITE); }
        return Optional.ofNullable(message);
    }

    public boolean active(long userId) {
        User user = entities.find(User.class, userId);
        return user != null && user.getDeletedAt() == null;
    }

    public Map<Long, String> nicknames(Set<Long> ids) {
        if (ids.isEmpty()) { return Map.of(); }
        return entities.createQuery("select u from User u where u.id in :ids and u.deletedAt is null", User.class)
                .setParameter("ids", ids).getResultList().stream()
                .collect(Collectors.toMap(User::getId, User::getNickname));
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
