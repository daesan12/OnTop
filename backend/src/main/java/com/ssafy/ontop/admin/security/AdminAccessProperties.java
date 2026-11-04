package com.ssafy.ontop.admin.security;

import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ontop.admin")
public record AdminAccessProperties(Set<Long> readIds, Set<Long> grantIds, Set<Long> operationIds) {
    public AdminAccessProperties {
        readIds = validIds(readIds);
        grantIds = validIds(grantIds);
        operationIds = operationIds == null || operationIds.isEmpty() ? grantIds : validIds(operationIds);
        if (!readIds.containsAll(grantIds) || !readIds.containsAll(operationIds)) {
            throw new IllegalArgumentException("쓰기 권한 관리자는 조회 관리자에도 포함해야 합니다.");
        }
    }

    private static Set<Long> validIds(Set<Long> ids) {
        if (ids == null) {
            return Set.of();
        }
        if (ids.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("관리자는 양수 회원 ID로 지정합니다.");
        }
        return Set.copyOf(ids);
    }
}
