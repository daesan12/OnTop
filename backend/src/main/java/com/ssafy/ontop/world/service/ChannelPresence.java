package com.ssafy.ontop.world.service;

import java.util.Map;

// 광장 연결 담당이 구현한다. 한 시점의 채널별 실제 사용자 수를 불변 스냅샷으로 반환한다.
// 테이블 연결 수나 클라이언트가 보낸 인원을 채널 인원으로 대신 사용하지 않는다.
@FunctionalInterface
public interface ChannelPresence {

    Map<String, Integer> snapshot();
}
