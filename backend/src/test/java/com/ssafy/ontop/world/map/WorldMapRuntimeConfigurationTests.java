package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelConfiguration;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import com.ssafy.ontop.world.service.WorldMapCompatibility;
import com.ssafy.ontop.world.service.WorldProximity;
import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class WorldMapRuntimeConfigurationTests {
    static WebApplicationContextRunner runner() {
        return new WebApplicationContextRunner()
                .withInitializer(context -> context.getBeanFactory()
                        .setConversionService(ApplicationConversionService.getSharedInstance()))
                .withUserConfiguration(WorldChannelConfiguration.class)
                .withBean(ObjectMapper.class, () -> new ObjectMapper().findAndRegisterModules())
                .withBean(BehaviorLog.class, BehaviorLog::disabled)
                .withBean(WorldChannelRegistry.class)
                .withBean(WorldMapCompatibility.class)
                .withBean(WorldChatService.class)
                .withBean(WorldEmoteService.class)
                .withBean(WorldProximity.class)
                .withBean(TableHub.class);
    }

    @Test
    void 기본설정은_기존맵과_두개_테이블을_사용한다() {
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(WorldMapRuntime.class).prepared()).isEmpty();
            assertThat(context.getBean(WorldMapCompatibility.class).metadata().schemaVersion()).isEqualTo(1);
            assertThat(context.getBean(WorldMapCompatibility.class).requiresMatch()).isFalse();
            assertThat(context.getBean(TableHub.class).listTables().tables()).hasSize(2);
        });
    }

    @Test
    void 유동_채널을_켜면_설정_채널이_없어도_첫_공원과_테이블을_준비한다() {
        runner().withPropertyValues("ontop.world.dynamic-channels.enabled=true").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(WorldChannelRegistry.class).definitions()).hasSize(1);
            assertThat(context.getBean(WorldChannelRegistry.class).definitions().getFirst().capacity()).isEqualTo(20);
            assertThat(context.getBean(TableHub.class).listTables("channel-1").tables()).hasSize(16);
        });
    }

    @Test
    void 생성_기준이_정원_이상이면_시작하지_않는다() {
        runner().withPropertyValues("ontop.world.dynamic-channels.enabled=true",
                "ontop.world.dynamic-channels.spawn-at=20")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void 경로만_지정해도_기본_맵을_전환하거나_파일을_열지_않는다() {
        runner().withPropertyValues("ontop.world.map.json-path=missing-map.json",
                "ontop.world.map.manifest-path=missing-manifest.json").run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(WorldMapRuntime.class).prepared()).isEmpty();
                    assertThat(context.getBean(TableHub.class).listTables().tables()).hasSize(2);
                });
    }

    @Test
    void 알수없는_선택값은_기존맵으로_대신_실행하지_않고_실패한다() {
        runner().withPropertyValues("ontop.world.map.source=generated-typo")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void 새맵에_경로나_확인_설정이_없으면_시작하지_않는다() {
        runner().withPropertyValues("ontop.world.map.source=generated", "ontop.world.map.require-match=true")
                .run(context -> assertThat(context).hasFailed().getFailure().rootCause()
                        .hasMessageContaining("JSON·manifest"));
        runner().withPropertyValues("ontop.world.map.source=generated", "ontop.world.map.json-path=map.json",
                "ontop.world.map.manifest-path=manifest.json")
                .run(context -> assertThat(context).hasFailed().getFailure().rootCause()
                        .hasMessageContaining("require-match=true"));
    }

    @Test
    void 읽을수없는_생성파일은_시작을_실패시킨다() {
        runner().withPropertyValues("ontop.world.map.source=generated", "ontop.world.map.require-match=true",
                "ontop.world.map.json-path=missing-map.json", "ontop.world.map.manifest-path=missing-manifest.json",
                "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=검증",
                "ontop.world.channels[0].capacity=4").run(context -> assertThat(context).hasFailed());
    }
}
