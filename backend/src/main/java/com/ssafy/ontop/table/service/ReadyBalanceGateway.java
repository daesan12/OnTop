package com.ssafy.ontop.table.service;

/** Read-only preparation check. Reserving/charging remains exclusively at game start/settlement. */
@FunctionalInterface
public interface ReadyBalanceGateway {
    long availableBalance(long userId);
}
