package com.ssafy.ontop.config;

/** Real game and park features shared by development and production, excluding mixed profiles. */
public final class RuntimeProfiles {
    public static final String PRODUCT_FEATURE = "((local | dev) & !prod & !production)"
            + " | ((prod | production) & db & !local & !dev)";
    public static final String PRODUCT_FEATURE_WITH_DB = "(" + PRODUCT_FEATURE + ") & db";

    private RuntimeProfiles() { }
}
