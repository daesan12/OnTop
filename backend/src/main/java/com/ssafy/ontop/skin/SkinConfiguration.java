package com.ssafy.ontop.skin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.config.RuntimeProfiles;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods=false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name="ontop.skin.enabled",havingValue="true")
public class SkinConfiguration {
    @Bean SkinSettings skinSettings(@Value("${SKIN_ASSET_BUCKET:}") String bucket,@Value("${SKIN_ASSET_REGION:ap-northeast-2}") String region,
            @Value("${SKIN_ASSET_CDN_BASE_URL:}") String cdn,@Value("${SKIN_ASSET_ENVIRONMENT:}") String environment,
            @Value("${SKIN_UPLOAD_URL_TTL_SECONDS:300}") int ttl,@Value("${SKIN_UPLOAD_MAX_MODEL_BYTES:20971520}") long modelMax,
            @Value("${SKIN_UPLOAD_MAX_IMAGE_BYTES:2097152}") long imageMax,@Value("${SKIN_ADMIN_USER_IDS:}") String ids,
            org.springframework.core.env.Environment runtime) {
        Set<Long> admins=Arrays.stream(ids.split(",")).map(String::trim).filter(s->!s.isEmpty()).map(Long::valueOf).collect(Collectors.toSet());
        if(admins.stream().anyMatch(id->id<=0)) throw new IllegalArgumentException("스킨 관리자 ID가 올바르지 않습니다.");
        var profiles=Set.of(runtime.getActiveProfiles());
        String expected=profiles.contains("prod")||profiles.contains("production")?"prod":profiles.contains("dev")?"dev":"local";
        if(!environment.isBlank()&&!environment.equals(expected)) throw new IllegalArgumentException("스킨 파일 환경은 실행 프로필과 같아야 합니다.");
        return new SkinSettings(bucket,region,cdn,expected,ttl,modelMax,imageMax,admins);
    }
    @Bean SkinRepository skinRepository(JdbcTemplate jdbc) { return new SkinRepository(jdbc); }
    @Bean(destroyMethod="close") S3SkinStorage skinStorage(SkinSettings settings) { return new S3SkinStorage(settings); }
    @Bean SkinSetService skinSetService(JdbcTemplate jdbc,SkinRepository repository,SkinSettings settings,
            PlatformTransactionManager manager,AdminAccessPolicy admins) {
        return new SkinSetService(jdbc,repository,settings,manager,admins::canOperate);
    }
    @Bean SkinService skinService(SkinRepository repository,SkinSettings settings,SkinStorage storage,ObjectMapper json,
            PlatformTransactionManager manager,AdminAccessPolicy admins,
            @Value("${ontop.shop.enabled:false}") boolean shop) {
        if(!shop) throw new IllegalStateException("스킨 공개는 기존 상점 스키마와 SHOP_ENABLED=true가 필요합니다.");
        return new SkinService(repository,settings,storage,new SkinFileValidator(json),manager,admins::canOperate);
    }
}
