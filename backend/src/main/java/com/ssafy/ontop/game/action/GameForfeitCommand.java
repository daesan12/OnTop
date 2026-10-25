package com.ssafy.ontop.game.action;

/** userId는 클라이언트 입력이 아니라 현재 인증 연결에서 가져온다. */
public record GameForfeitCommand(long userId, String gameId, String actionId) {
}
