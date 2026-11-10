package com.ssafy.ontop.skin;

import com.ssafy.ontop.skin.SkinDtos.*;

/** AWS 접속과 등록 트랜잭션을 분리한다. 테스트 대역은 test 소스에서만 제공한다. */
public interface SkinStorage {
    boolean ready();
    Target upload(String key,FileSpec spec,String contentType);
    byte[] read(String key,long expectedBytes);
    void seal(String key,byte[] bytes,String contentType,String sha256);
    String url(String key);
    static SkinException unavailable() { return new SkinException(503,"SKIN_STORAGE_UNAVAILABLE","S3·CDN 연결 설정이 필요합니다. 임시저장은 사용할 수 있어요."); }
}
