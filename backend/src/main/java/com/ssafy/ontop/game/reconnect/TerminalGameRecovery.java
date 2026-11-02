package com.ssafy.ontop.game.reconnect;

/** DB에 이미 종결 판정이 저장된 경기만 기존 정산으로 연결한다. 새 판정을 만들지 않는다. */
@FunctionalInterface
public interface TerminalGameRecovery {
    void settleStored(long userId, ActiveGameRecord record);
}
