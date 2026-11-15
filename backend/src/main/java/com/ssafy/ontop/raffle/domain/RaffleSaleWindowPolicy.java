package com.ssafy.ontop.raffle.domain;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Objects;

public final class RaffleSaleWindowPolicy {
    private static final ZoneId KST = RaffleSaleWindow.KST;
    private final OverridePeriod override;

    private RaffleSaleWindowPolicy(OverridePeriod override) {
        this.override = override;
    }

    public static RaffleSaleWindowPolicy defaults() {
        return new RaffleSaleWindowPolicy(null);
    }

    public static RaffleSaleWindowPolicy override(LocalDate weekStartDate, Instant salesStartsAt,
            Instant salesEndsAt) {
        return new RaffleSaleWindowPolicy(new OverridePeriod(weekStartDate, salesStartsAt, salesEndsAt));
    }

    public Selection select(Instant instant) {
        Instant now = Objects.requireNonNull(instant);
        if (override == null || !override.appliesAt(now)) {
            return new Selection(RaffleSaleWindow.at(now), false);
        }
        return new Selection(RaffleSaleWindow.forPeriod(override.weekStartDate,
                override.salesStartsAt, override.salesEndsAt, now), true);
    }

    public record Selection(RaffleSaleWindow window, boolean overridden) {
        public Selection {
            Objects.requireNonNull(window);
        }
    }

    private static final class OverridePeriod {
        private final LocalDate weekStartDate;
        private final Instant salesStartsAt;
        private final Instant salesEndsAt;
        private final Instant appliesFrom;
        private final Instant appliesUntil;

        private OverridePeriod(LocalDate weekStartDate, Instant salesStartsAt, Instant salesEndsAt) {
            this.weekStartDate = Objects.requireNonNull(weekStartDate);
            this.salesStartsAt = Objects.requireNonNull(salesStartsAt);
            this.salesEndsAt = Objects.requireNonNull(salesEndsAt);
            RaffleSaleWindow.forPeriod(weekStartDate, salesStartsAt, salesEndsAt, salesStartsAt);
            this.appliesFrom = weekStartDate.atStartOfDay(KST).toInstant();
            LocalDate startDate = salesStartsAt.atZone(KST).toLocalDate();
            LocalDate endDate = salesEndsAt.atZone(KST).toLocalDate();
            LocalDate nextWeek = endDate.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
            this.appliesUntil = nextWeek.atStartOfDay(KST).toInstant();
            if (startDate.isBefore(weekStartDate) || !startDate.isBefore(weekStartDate.plusWeeks(1))) {
                throw new IllegalArgumentException("응모권 판매 시작 시각은 기준 주차 안에 있어야 합니다.");
            }
            if (!salesEndsAt.isAfter(appliesFrom)) {
                throw new IllegalArgumentException("응모권 판매 종료 시각은 기준 주차 시작보다 뒤여야 합니다.");
            }
        }

        private boolean appliesAt(Instant instant) {
            return !instant.isBefore(appliesFrom) && instant.isBefore(appliesUntil);
        }
    }
}
