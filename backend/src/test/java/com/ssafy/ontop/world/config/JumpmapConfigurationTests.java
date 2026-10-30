package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class JumpmapConfigurationTests {
    private static final Path GENERATED = Path.of("../frontend/generated/park");

    private static WebApplicationContextRunner runner() {
        return new WebApplicationContextRunner()
                .withInitializer(context -> context.getBeanFactory()
                        .setConversionService(ApplicationConversionService.getSharedInstance()))
                .withUserConfiguration(WorldChannelConfiguration.class, JumpmapConfiguration.class);
    }

    @Test
    void 기본설정은_점프맵_비활성이다() {
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JumpmapActivation.class).state()).isEqualTo(JumpmapActivation.State.DISABLED);
        });
    }

    @Test
    void 기존맵에서는_플래그를_켜도_맵버전_불일치로_비활성이고_서버는_시작한다() {
        runner().withPropertyValues("ontop.world.jumpmap.enabled=true").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JumpmapActivation.class).state()).isEqualTo(JumpmapActivation.State.MAP_MISMATCH);
        });
    }

    @Test
    void 같은_생성맵을_선택하고_플래그를_켜면_활성이다() {
        runner().withPropertyValues("ontop.world.jumpmap.enabled=true",
                        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=공원",
                        "ontop.world.channels[0].capacity=20",
                        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
                        "ontop.world.map.json-path=" + GENERATED.resolve("server-map.json").toAbsolutePath(),
                        "ontop.world.map.manifest-path=" + GENERATED.resolve("manifest.json").toAbsolutePath())
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var activation = context.getBean(JumpmapActivation.class);
                    assertThat(activation.state()).isEqualTo(JumpmapActivation.State.ACTIVE);
                    assertThat(activation.course()).get().extracting(course -> course.colliders().size()).isEqualTo(113);
                });
    }
}
