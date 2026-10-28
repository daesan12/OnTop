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
    void production에서도_인증된_채널과_테이블_조회_API를_등록한다() {
        assertThat(context.getBeansOfType(TableQueryController.class)).hasSize(1);
        assertThat(context.getBeansOfType(ChannelQueryController.class)).hasSize(1);
        assertThat(context.getBeansOfType(ChannelQueryService.class)).hasSize(1);
    }
}
