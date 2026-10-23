package com.ssafy.ontop.behavior.domain;

/** 저장 큐에 함께 들어가는 기록 종류. 위치는 행 수가 많아 큐가 찰 때 먼저 버린다. */
public sealed interface BehaviorRecord permits BehaviorEvent, PositionSample {
}
