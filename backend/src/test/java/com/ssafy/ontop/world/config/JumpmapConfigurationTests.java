package com.ssafy.ontop.world.config;

import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import com.ssafy.ontop.world.jumpmap.JumpmapService;
import com.ssafy.ontop.world.jumpmap.JumpmapStore;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
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
        return withStore(true);
    }

    private static WebApplicationContextRunner withStore(boolean ready) {
        return runner().withBean(JumpmapStore.class, () -> {
            var store = Mockito.mock(JumpmapStore.class);
            Mockito.when(store.ready()).thenReturn(ready);
            return store;
        });
    }

    @Test
    void 테이블이_없는_DB에서는_플래그를_켜도_서버는_시작하고_점프맵만_비활성이다() {
        withStore(false).withPropertyValues(generated()).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JumpmapActivation.class).state()).isEqualTo(JumpmapActivation.State.NO_STORE);
            assertThat(context.getBean(JumpmapService.class).active()).isFalse();
        });
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

    private static Boolean flag(String... properties) {
        var values = new Boolean[1];
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues(properties)
                .run(context -> values[0] = context.getEnvironment().getProperty("ontop.world.jumpmap.enabled", Boolean.class));
        return values[0];
    }

    @Test
    void 개발서버_프로필은_환경변수_없이_점프맵_플래그가_켜지고_명시적으로_끌수있다() {
        assertThat(flag("spring.profiles.active=dev,db")).isTrue();
        assertThat(flag("spring.profiles.active=dev,db", "WORLD_JUMPMAP_ENABLED=false")).isFalse();
    }

    @Test
    void 운영과_로컬_프로필의_점프맵_플래그_기본값은_꺼져있다() {
        for (String profiles : List.of("prod,db", "dev,prod", "dev,production", "local", "local,db")) {
            assertThat(flag("spring.profiles.active=" + profiles)).as(profiles).isFalse();
        }
        assertThat(flag()).isFalse();
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
