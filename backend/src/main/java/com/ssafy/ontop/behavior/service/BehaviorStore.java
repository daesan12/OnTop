package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.PositionSample;
import java.util.List;

/** 묶음 하나를 한 트랜잭션으로 저장한다. 실패하면 아무것도 남기지 않아 재시도해도 중복되지 않는다. */
public interface BehaviorStore {

    void save(List<BehaviorEvent> events, List<PositionSample> positions);
}
