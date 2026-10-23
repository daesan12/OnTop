package com.ssafy.ontop.table;

import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.table.controller.TableQueryController;
import com.ssafy.ontop.world.controller.ChannelQueryController;
import com.ssafy.ontop.world.service.ChannelQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
@ActiveProfiles({"dev", "production"})
class DevParkProductionProfileTests {
    @Autowired
    private ApplicationContext context;
    @MockitoBean
    private ActiveMemberLookup members;

    @Test
    void production과_함께_켜면_개발_조회_API를_등록하지_않는다() {
        assertThat(context.getBeansOfType(TableQueryController.class)).isEmpty();
        assertThat(context.getBeansOfType(ChannelQueryController.class)).isEmpty();
        assertThat(context.getBeansOfType(ChannelQueryService.class)).isEmpty();
    }
}
