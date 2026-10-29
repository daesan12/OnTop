package com.ssafy.ontop.auth.websocket;

import java.security.Principal;
import java.util.Optional;

// 인증 담당의 서버 Bean으로 구현한다. Principal 이름이나 클라이언트 ID를 그대로 신뢰하지 않는다.
// 로그인 유효성·계정 상태·네이버/SSAFY 제공자를 확인하고 내부 사용자 ID로 매핑한다.
@FunctionalInterface
public interface WebSocketUserResolver {

    Optional<VerifiedWebSocketUser> resolve(Principal principal);
}
