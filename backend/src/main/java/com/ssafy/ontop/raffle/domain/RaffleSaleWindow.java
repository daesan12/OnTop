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
        return forPeriod(monday, startsAt, endsAt, now);
    }

    public static RaffleSaleWindow forPeriod(LocalDate weekStartDate, Instant salesStartsAt,
            Instant salesEndsAt, Instant instant) {
        LocalDate week = Objects.requireNonNull(weekStartDate);
        Instant startsAt = Objects.requireNonNull(salesStartsAt);
        Instant endsAt = Objects.requireNonNull(salesEndsAt);
        Instant now = Objects.requireNonNull(instant);
        if (week.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new IllegalArgumentException("응모권 기준 주차는 KST 월요일이어야 합니다.");
        }
        if (!startsAt.isBefore(endsAt)) {
            throw new IllegalArgumentException("응모권 판매 시작 시각은 종료 시각보다 앞서야 합니다.");
        }
        String status = now.isBefore(startsAt) ? "SCHEDULED" : now.isBefore(endsAt) ? "OPEN" : "CLOSED";
        return new RaffleSaleWindow(week, startsAt, endsAt, status);
    }

    public boolean isOpenAt(Instant instant) {
        Instant now = Objects.requireNonNull(instant);
        return !now.isBefore(salesStartsAt) && now.isBefore(salesEndsAt);
    }
}
