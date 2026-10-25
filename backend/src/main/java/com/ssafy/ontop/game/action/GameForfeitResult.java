package com.ssafy.ontop.game.action;

/** version은 최초 기권 확정 버전이다. 재전송해도 기권·정산 이벤트를 다시 만들지 않는다. */
public record GameForfeitResult(long userId, String gameId, String actionId, long version, boolean duplicate) {
}
