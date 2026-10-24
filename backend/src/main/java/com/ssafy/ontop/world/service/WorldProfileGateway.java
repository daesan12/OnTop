package com.ssafy.ontop.world.service;

import java.util.Map;
import java.util.Set;

/** 접속 중인 회원의 공개 표시 정보만 일괄 조회한다. */
public interface WorldProfileGateway {
    Map<Long, Profile> profiles(Set<Long> userIds);

    record Profile(String nickname, String characterGender) {
        public Profile {
            if (nickname == null || nickname.isBlank()
                    || !("MALE".equals(characterGender) || "FEMALE".equals(characterGender))) {
                throw new IllegalArgumentException("공개 닉네임과 캐릭터 외형 구분이 필요합니다.");
            }
        }
    }
}
