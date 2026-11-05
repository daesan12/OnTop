package com.ssafy.ontop.game.skewer;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.game.skewer.coop.controller.SkewerCoopController;
import com.ssafy.ontop.game.skewer.coop.domain.SkewerCoopRoomAccess;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.service.UserProfileService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SkewerCoopControllerTests {
    private static final String ROOM_ID = "skewer-10000000-0000-0000-0000-000000000001";
    private final SkewerCoopEngine engine = mock(SkewerCoopEngine.class);
    private MockMvc mvc;

    @BeforeEach
    void 준비() {
        mvc = MockMvcBuilders.standaloneSetup(new SkewerCoopController(engine, mock(TableHub.class),
                        mock(SkewerCoopSettlementService.class), mock(UserProfileService.class)))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(
                new AuthenticatedUser(202, LoginProvider.NAVER, TestLoginSessions.ID), null));
    }

    @AfterEach
    void 인증정보_정리() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void 비밀번호_검증후_정원이_마감되면_별도_코드와_명확한_안내를_응답한다() throws Exception {
        거절_응답(new SkewerCoopRoomAccess.RoomFullException(), "SKEWER_COOP_ROOM_FULL",
                "가게 인원이 가득 찼어요. 다른 가게를 선택해 주세요.");
    }

    @Test
    void 틀린_비밀번호는_정원마감과_구분해_응답한다() throws Exception {
        거절_응답(new SkewerCoopRoomAccess.PasswordRejected(false), "SKEWER_COOP_PASSWORD_INVALID",
                "비밀번호가 맞지 않아요.");
    }

    @Test
    void 재시도_제한도_정원마감과_구분해_응답한다() throws Exception {
        거절_응답(new SkewerCoopRoomAccess.PasswordRejected(true), "SKEWER_COOP_PASSWORD_THROTTLED",
                "비밀번호를 여러 번 확인했어요. 30초 후 다시 시도해주세요.");
    }

    private void 거절_응답(RuntimeException failure, String code, String message) throws Exception {
        doThrow(failure).when(engine).join(202, "park", ROOM_ID, "abcd");
        mvc.perform(post("/api/v1/minigames/skewer/coop/rooms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"channelId":"park","gameId":"%s","password":"abcd"}
                                """.formatted(ROOM_ID)))
                .andExpect(status().isConflict())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").value(message));
    }
}
