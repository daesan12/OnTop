package com.ssafy.ontop.raffle.domain;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Objects;

public record RaffleSaleWindow(LocalDate weekStartDate, Instant salesStartsAt, Instant salesEndsAt,
        String salesStatus) {
    public static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final LocalTime SALES_START_TIME = LocalTime.of(9, 0);

    public static RaffleSaleWindow at(Instant instant) {
        Instant now = Objects.requireNonNull(instant);
        LocalDate today = now.atZone(KST).toLocalDate();
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Instant startsAt = monday.atTime(SALES_START_TIME).atZone(KST).toInstant();
        Instant endsAt = monday.plusWeeks(1).atStartOfDay(KST).toInstant();
        String status = now.isBefore(startsAt) ? "SCHEDULED" : "OPEN";
        return new RaffleSaleWindow(monday, startsAt, endsAt, status);
    }

    public boolean isOpenAt(Instant instant) {
        Instant now = Objects.requireNonNull(instant);
        return !now.isBefore(salesStartsAt) && now.isBefore(salesEndsAt);
    }
}
