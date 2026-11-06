package com.ssafy.ontop.admin.security;

public final class AdminAccessPolicy {
    private final AdminAccessProperties properties;

    public AdminAccessPolicy(AdminAccessProperties properties) {
        this.properties = properties;
    }

    public boolean canRead(long userId) {
        return properties.readIds().contains(userId);
    }

    public boolean canGrant(long userId) {
        return properties.grantIds().contains(userId);
    }

    public boolean canOperate(long userId) {
        return properties.operationIds().contains(userId);
    }

    public boolean canViewContacts(long userId) {
        return properties.contactIds().contains(userId);
    }
}
