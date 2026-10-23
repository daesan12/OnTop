package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.LoginSessionKey;
import com.ssafy.ontop.shop.ShopModels;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 이미 발행되는 인증 폐기·장착 이벤트로 로그아웃·탈퇴·장착을 기록한다. 커밋된 결과만 남긴다. */
@Component
public class AccountBehaviorListener {

    private final BehaviorLog behaviorLog;
    private final Clock clock;

    @Autowired
    public AccountBehaviorListener(BehaviorLog behaviorLog) {
        this(behaviorLog, Clock.systemUTC());
    }

    AccountBehaviorListener(BehaviorLog behaviorLog, Clock clock) {
        this.behaviorLog = behaviorLog;
        this.clock = clock;
    }

    /** 보안상 폐기(SESSION_REVOKED)는 사용자의 행동이 아니므로 남기지 않는다. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void revoked(AuthenticationRevocations.Revoked event) {
        BehaviorEventType type = switch (event.reason()) {
            case LOGOUT -> BehaviorEventType.AUTH_LOGOUT;
            case MEMBER_DEACTIVATED -> BehaviorEventType.USER_WITHDRAWN;
            case SESSION_REVOKED -> null;
        };
        if (type == null) {
            return;
        }
        behaviorLog.record(() -> BehaviorEvent.builder(type, clock.instant())
                .userId(event.userId())
                .loginSessionId(LoginSessionKey.of(event.sessionId()))
                .build());
    }

    /** ShopService가 커밋 후에 발행한다. */
    @EventListener
    public void equipped(ShopModels.EquipmentChanged event) {
        behaviorLog.record(() -> BehaviorEvent.builder(BehaviorEventType.ITEM_EQUIPPED, clock.instant())
                .userId(event.userId())
                .prop("itemId", event.itemId())
                .build());
    }
}
