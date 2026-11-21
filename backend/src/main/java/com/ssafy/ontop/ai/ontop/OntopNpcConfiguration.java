package com.ssafy.ontop.ai.ontop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.movement.ParkNavigation;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 기존 맵·제브 설정을 읽는 애플리케이션 연결부. 환경·DB·배포 설정을 변경하지 않는다. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "ontop.ai.enabled", havingValue = "true")
public class OntopNpcConfiguration {
    @Bean(destroyMethod = "close")
    AutoCloseable ontopNpcRuntime(TableHub hub, WorldMapRuntime map, ObjectMapper mapper,
            @Value("${JEV_API_KEY:}") String key,
            @Value("${JEV_MODEL:jev-1.14.0}") String model,
            @Value("${AI_JEV_ENABLED:true}") boolean enabled) {
        if (map.prepared().isEmpty()
                || map.prepared().orElseThrow().collisionData().path("winterSnowPiles").isEmpty()) {
            return () -> { };
        }
        var navigation = new ParkNavigation(map.scene());
        var origin = navigation.groundPoint(-5, 44);
        var homePath = navigation.path(origin, origin);
        if (homePath.isEmpty() || homePath.getLast().distance(origin) > 2.4) {
            navigation.close();
            throw new IllegalStateException("온탑 시작점이 현재 광장 서쪽 눈더미 범위에서 이동 가능하지 않습니다.");
        }
        var home = homePath.getLast();
        JevOntopIntent jev = enabled && !key.isBlank() ? new JevOntopIntent(mapper, key, model) : null;
        hub.configureOntop(new OntopNpcService.Navigation() {
            @Override
            public ParkNavigation.Point home() {
                return home;
            }

            @Override
            public List<ParkNavigation.Point> path(ParkNavigation.Point from, ParkNavigation.Point to) {
                return navigation.path(from, to, new ParkNavigation.Area(-19, 9, 30, 58));
            }
        }, jev == null ? OntopIntent.offline() : jev);
        return () -> {
            hub.disableOntop();
            if (jev != null) {
                jev.close();
            }
            navigation.close();
        };
    }
}
