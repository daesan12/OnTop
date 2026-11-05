package com.ssafy.ontop.operation.config;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 운영 배출·점검 중에는 실행하지 않아야 하는 신규 활동 진입점. */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface NewActivity {
}
