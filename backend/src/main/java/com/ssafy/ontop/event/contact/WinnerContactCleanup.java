package com.ssafy.ontop.event.contact;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

public final class WinnerContactCleanup {
    private static final Logger log = LoggerFactory.getLogger(WinnerContactCleanup.class);
    private final WinnerContactService service;

    public WinnerContactCleanup(WinnerContactService service) {
        this.service = service;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 0)
    public void removeExpired() {
        try {
            int removed = service.deleteExpired();
            if (removed > 0) {
                log.info("만료된 이벤트 연락처 {}건을 삭제했습니다.", removed);
            }
        } catch (RuntimeException exception) {
            log.error("만료된 이벤트 연락처 삭제에 실패했습니다.", exception);
        }
    }
}
