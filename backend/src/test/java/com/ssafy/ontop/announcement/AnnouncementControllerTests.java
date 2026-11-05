package com.ssafy.ontop.announcement;

import com.ssafy.ontop.admin.security.*;
import com.ssafy.ontop.announcement.controller.*;
import com.ssafy.ontop.announcement.service.*;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AnnouncementControllerTests {
    private final AnnouncementService service = mock(AnnouncementService.class);
    private MockMvc mvc(boolean enabled) {
        var beans = new StaticListableBeanFactory();
        if (enabled) beans.addBean("announcements", service);
        return MockMvcBuilders.standaloneSetup(new AnnouncementController(beans.getBeanProvider(AnnouncementService.class),
                new AdminAccessPolicy(new AdminAccessProperties(Set.of(7L, 8L), Set.of(), Set.of(7L)))))
                .setControllerAdvice(new AnnouncementExceptionHandler()).build();
    }
    @Test void 미인증과_조회전용_관리자는_쓰기_목록을_열_수_없다() throws Exception {
        mvc(true).perform(get("/api/v1/admin/operations/announcements")).andExpect(status().isUnauthorized());
        mvc(true).perform(get("/api/v1/admin/operations/announcements").principal(() -> "8")).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
    @Test void 운영_관리자는_목록을_캐시하지_않고_받는다() throws Exception {
        mvc(true).perform(get("/api/v1/admin/operations/announcements").principal(() -> "7"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        verify(service).list();
    }
    @Test void 저장소가_꺼져있으면_서비스_준비중으로_구분한다() throws Exception {
        mvc(false).perform(get("/api/v1/announcements").principal(() -> "9")).andExpect(status().isServiceUnavailable());
    }
    @Test void 버전_충돌은_409로_반환한다() throws Exception {
        doThrow(new AnnouncementConflictException()).when(service).remove("a78baf0b-0246-4391-adef-a247f90ac50a", 2, 7);
        mvc(true).perform(delete("/api/v1/admin/operations/announcements/a78baf0b-0246-4391-adef-a247f90ac50a?version=2").principal(() -> "7"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ANNOUNCEMENT_CONFLICT"));
    }

    @Test void 순서_저장은_운영관리자만_허용하고_204를_반환한다() throws Exception {
        String json = "{\"items\":[]}";
        mvc(true).perform(put("/api/v1/admin/operations/announcements/order").contentType("application/json").content(json))
                .andExpect(status().isUnauthorized());
        mvc(true).perform(put("/api/v1/admin/operations/announcements/order").principal(() -> "8")
                .contentType("application/json").content(json)).andExpect(status().isForbidden());
        verifyNoInteractions(service);
        mvc(true).perform(put("/api/v1/admin/operations/announcements/order").principal(() -> "7")
                .contentType("application/json").content(json)).andExpect(status().isNoContent())
                .andExpect(header().string("Cache-Control", "no-store"));
        verify(service).reorder(any(), eq(7L));
    }
}
