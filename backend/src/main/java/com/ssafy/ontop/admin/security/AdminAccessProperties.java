package com.ssafy.ontop.admin.security;

import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "ontop.admin")
public record AdminAccessProperties(Set<Long> readIds, Set<Long> grantIds, Set<Long> operationIds,
        Set<Long> contactIds) {
    @ConstructorBinding
    public AdminAccessProperties {
        readIds = validIds(readIds);
        grantIds = validIds(grantIds);
        operationIds = operationIds == null || operationIds.isEmpty() ? grantIds : validIds(operationIds);
        contactIds = validIds(contactIds);
        if (!readIds.containsAll(grantIds) || !readIds.containsAll(operationIds)
                || !readIds.containsAll(contactIds)) {
            throw new IllegalArgumentException("관리자 세부 권한 ID는 조회 관리자에도 포함해야 합니다.");
        }
    }

    public AdminAccessProperties(Set<Long> readIds, Set<Long> grantIds, Set<Long> operationIds) {
        this(readIds, grantIds, operationIds, Set.of());
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
