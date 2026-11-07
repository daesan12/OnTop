package com.ssafy.ontop.notification.repository;

import com.ssafy.ontop.notification.domain.NotificationReward;
import com.ssafy.ontop.notification.domain.PersonalNotification;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

/** 보상 모듈의 JPA 저장 경계. 기존 지갑·뽑기 서비스와 스키마를 그대로 재사용한다. */
public class NotificationRewardRepository {
    private final EntityManager entities;

    public NotificationRewardRepository(EntityManager entities) { this.entities = entities; }

    public boolean member(long userId) {
        User user = entities.find(User.class, userId, LockModeType.PESSIMISTIC_READ);
        if (user == null) { return false; }
        entities.refresh(user, LockModeType.PESSIMISTIC_READ);
        return user.getDeletedAt() == null;
    }

    public Optional<Wallet> wallet(long userId) {
        return entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultStream().findFirst().map(wallet -> {
                    entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE);
                    return wallet;
                });
    }

    public Optional<NotificationReward> operation(String id) {
        return Optional.ofNullable(entities.find(NotificationReward.class, id));
    }

    public PersonalNotification notification(long id, long userId) {
        return entities.createQuery("select n from PersonalNotification n where n.id = :id and n.userId = :user",
                        PersonalNotification.class).setParameter("id", id).setParameter("user", userId)
                .getResultStream().findFirst().orElseThrow(() ->
                        new com.ssafy.ontop.feedback.service.FeedbackException(404, "NOTIFICATION_NOT_FOUND", "보상을 찾을 수 없습니다."));
    }

    public NotificationReward reward(long notificationId) {
        return entities.createQuery("select r from NotificationReward r where r.notificationId = :id",
                        NotificationReward.class).setParameter("id", notificationId)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultStream().findFirst().orElseThrow(() ->
                        new com.ssafy.ontop.feedback.service.FeedbackException(404, "NOTIFICATION_NOT_FOUND", "보상을 찾을 수 없습니다."));
    }

    public void notification(PersonalNotification value) { entities.persist(value); entities.flush(); }
    public void reward(NotificationReward value) { entities.persist(value); entities.flush(); }
    public void flush() { entities.flush(); }

    public void coinLedger(long walletId, NotificationReward reward, Instant now) {
        // 팀원 지갑 엔티티에 새 생성자를 추가하지 않고 공통 원장 계약을 JPA로 기록한다.
        entities.createNativeQuery("INSERT INTO wallet_transactions"
                        + "(wallet_id,transaction_type,balance_delta,reserved_delta,idempotency_key,created_at)"
                        + " VALUES(:wallet,'NOTIFICATION_REWARD',:amount,0,:key,:now)")
                .setParameter("wallet", walletId).setParameter("amount", reward.amount())
                .setParameter("key", "notification-reward:" + reward.id())
                .setParameter("now", Timestamp.from(now)).executeUpdate();
    }

    public long tickets(long userId, long amount) {
        // V157의 보유함 계약을 공유한다. 새 보유함이나 JDBC 의존성을 만들지 않는다.
        entities.createNativeQuery("INSERT INTO gacha_inventory(user_id) VALUES(:user)"
                        + " ON DUPLICATE KEY UPDATE user_id=user_id")
                .setParameter("user", userId).executeUpdate();
        long before = ((Number) entities.createNativeQuery("SELECT tickets FROM gacha_inventory"
                        + " WHERE user_id=:user FOR UPDATE").setParameter("user", userId).getSingleResult()).longValue();
        long after = Math.addExact(before, amount);
        entities.createNativeQuery("UPDATE gacha_inventory SET tickets=:amount WHERE user_id=:user")
                .setParameter("amount", after).setParameter("user", userId).executeUpdate();
        return after;
    }

    public void requireTicketStorage() {
        entities.createNativeQuery("SELECT user_id FROM gacha_inventory LIMIT 1").getResultList();
    }
}
