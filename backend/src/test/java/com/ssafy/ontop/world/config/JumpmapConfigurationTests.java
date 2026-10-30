package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import com.ssafy.ontop.world.jumpmap.JumpmapService;
import com.ssafy.ontop.world.jumpmap.JumpmapStore;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
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

    private static WebApplicationContextRunner withStore() {
        return runner().withBean(JumpmapStore.class, () -> Mockito.mock(JumpmapStore.class));
    }

    private static String[] generated() {
        return new String[] {"ontop.world.jumpmap.enabled=true",
                "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=공원",
                "ontop.world.channels[0].capacity=20",
                "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
                "ontop.world.map.json-path=" + GENERATED.resolve("server-map.json").toAbsolutePath(),
                "ontop.world.map.manifest-path=" + GENERATED.resolve("manifest.json").toAbsolutePath()};
    }

    @Test
    void 기본설정은_점프맵_비활성이다() {
        withStore().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JumpmapActivation.class).state()).isEqualTo(JumpmapActivation.State.DISABLED);
            assertThat(context.getBean(JumpmapService.class).active()).isFalse();
        });
    }

    @Test
    void 기존맵에서는_플래그를_켜도_맵버전_불일치로_비활성이고_서버는_시작한다() {
        withStore().withPropertyValues("ontop.world.jumpmap.enabled=true").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JumpmapActivation.class).state()).isEqualTo(JumpmapActivation.State.MAP_MISMATCH);
            assertThat(context.getBean(JumpmapService.class).active()).isFalse();
        });
    }

    @Test
    void 저장소가_없으면_같은_생성맵이어도_충돌체와_판정을_켜지_않는다() {
        runner().withPropertyValues(generated()).run(context -> {
            assertThat(context).hasNotFailed();
            var activation = context.getBean(JumpmapActivation.class);
            assertThat(activation.state()).isEqualTo(JumpmapActivation.State.NO_STORE);
            assertThat(activation.course()).isEmpty();
            assertThat(context.getBean(JumpmapService.class).active()).isFalse();
        });
    }

    @Test
    void 같은_생성맵과_저장소에서_플래그를_켜면_활성이다() {
        withStore().withPropertyValues(generated()).run(context -> {
            assertThat(context).hasNotFailed();
            var activation = context.getBean(JumpmapActivation.class);
            assertThat(activation.state()).isEqualTo(JumpmapActivation.State.ACTIVE);
            assertThat(activation.course()).get().extracting(course -> course.colliders().size()).isEqualTo(113);
            assertThat(context.getBean(JumpmapService.class).active()).isTrue();
        });
    }
}
