package com.ssafy.ontop.skin;

import java.net.URI;
import java.util.Set;

public record SkinSettings(String bucket,String region,String cdn,String environment,int ttlSeconds,
                           long modelMax,long imageMax,Set<Long> administrators) {
    public SkinSettings {
        if(!Set.of("dev","prod","local").contains(environment)||ttlSeconds<30||ttlSeconds>300
                ||modelMax<20||modelMax>20L*1024*1024||imageMax<12||imageMax>2L*1024*1024)
            throw new IllegalArgumentException("스킨 업로드 한도·환경을 확인하세요.");
        if(cdn!=null&&!cdn.isBlank()) {
            URI uri=URI.create(cdn);
            if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null)
                throw new IllegalArgumentException("스킨 CDN HTTPS 주소를 확인하세요.");
            cdn=cdn.replaceAll("/+$","");
        }
        administrators=Set.copyOf(administrators);
    }
    public boolean configured() { return bucket!=null&&!bucket.isBlank()&&region!=null&&!region.isBlank()&&cdn!=null&&!cdn.isBlank(); }
    public void requireAdmin(long userId) {
        if(!administrators.contains(userId)) throw new SkinException(403,"SKIN_ACCESS_DENIED","스킨 등록 권한이 없습니다.");
    }
}
