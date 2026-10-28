package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.table.controller.TableQueryController;
import com.ssafy.ontop.world.controller.ChannelQueryController;
import com.ssafy.ontop.world.service.ChannelQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.web.SecurityFilterChain;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.profiles.active=test")
class NonWebSecurityTests {
    @Autowired
    private ApplicationContext context;

    @Test
    void HTTP서버가_없는_서비스_컨텍스트는_Servlet_보안체인을_요구하지_않는다() {
        assertThat(context.getBeansOfType(SecurityFilterChain.class)).isEmpty();
        assertThat(context.getBean(AccessJwtService.class)).isNotNull();
        assertThat(context.getBeansOfType(TableQueryController.class)).isEmpty();
        assertThat(context.getBeansOfType(ChannelQueryController.class)).isEmpty();
        assertThat(context.getBeansOfType(ChannelQueryService.class)).isEmpty();
    }
}
