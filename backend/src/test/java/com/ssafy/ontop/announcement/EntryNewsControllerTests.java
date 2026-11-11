package com.ssafy.ontop.announcement;
import com.ssafy.ontop.announcement.controller.*;
import com.ssafy.ontop.announcement.service.EntryNewsService;
import com.ssafy.ontop.announcement.service.EntryNewsStorage;
import com.ssafy.ontop.admin.security.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.*;
import java.time.Instant;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class EntryNewsControllerTests {
 final EntryNewsService service=mock(EntryNewsService.class);
 final EntryNewsStorage storage=mock(EntryNewsStorage.class);
 MockMvc mvc(boolean enabled){var beans=new StaticListableBeanFactory();if(enabled){beans.addBean("entryNews",service);beans.addBean("storage",storage);}return MockMvcBuilders.standaloneSetup(new EntryNewsController(beans.getBeanProvider(EntryNewsService.class),beans.getBeanProvider(EntryNewsStorage.class),new AdminAccessPolicy(new AdminAccessProperties(Set.of(7L,8L),Set.of(),Set.of(7L))))).setControllerAdvice(new AnnouncementExceptionHandler()).build();}
 @Test void 회원과_관리자_권한을_구분한다()throws Exception{
  mvc(true).perform(get("/api/v1/entry-news")).andExpect(status().isUnauthorized());
  mvc(true).perform(get("/api/v1/admin/operations/entry-news").principal(()->"8")).andExpect(status().isForbidden());
  verifyNoInteractions(service);
 }
 @Test void 미활성_저장소는_공원입장과_분리된_503이다()throws Exception{mvc(false).perform(get("/api/v1/entry-news").principal(()->"9")).andExpect(status().isServiceUnavailable());}
 @Test void 공개목록은_회원에게_no_store로_반환한다()throws Exception{
  when(service.feed()).thenReturn(new EntryNewsService.Feed(Instant.EPOCH,List.of()));
  mvc(true).perform(get("/api/v1/entry-news").principal(()->"9")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.pages").isEmpty());
 }
 @Test void 숨김이미지_관리자_경로는_운영권한이_필요하다()throws Exception{
  mvc(true).perform(get("/api/v1/admin/operations/entry-news/a78baf0b-0246-4391-adef-a247f90ac50a/image").principal(()->"8")).andExpect(status().isForbidden());
  verifyNoInteractions(service);
 }
 @Test void 직접업로드_발급도_운영관리자만_허용한다()throws Exception{
  String id="a78baf0b-0246-4391-adef-a247f90ac50a";
  mvc(true).perform(post("/api/v1/admin/operations/entry-news/"+id+"/uploads").principal(()->"8").contentType("application/json").content("{\"bytes\":20,\"sha256\":\""+"a".repeat(64)+"\",\"contentType\":\"image/png\"}")).andExpect(status().isForbidden());
  verifyNoInteractions(storage,service);
 }
 @Test void 저장은_현재_관리자_업로드_확인_후_기존_이미지_검증으로_연결한다()throws Exception{
  String id="a78baf0b-0246-4391-adef-a247f90ac50a",upload="a78baf0b-0246-4391-adef-a247f90ac50b";var verified=new EntryNewsStorage.VerifiedImage("key","a".repeat(64));
  when(storage.uploaded(eq(id),eq(7L),any())).thenReturn(verified);
  mvc(true).perform(post("/api/v1/admin/operations/entry-news/"+id).principal(()->"7").contentType("application/json").content("{\"draft\":{\"title\":\"소식\",\"published\":true,\"displayOrder\":0,\"expectedVersion\":0},\"upload\":{\"uploadId\":\""+upload+"\",\"bytes\":20,\"sha256\":\""+"a".repeat(64)+"\",\"contentType\":\"image/png\"}}")).andExpect(status().isOk());
  verify(service).save(eq(id),any(),same(verified),eq(true),eq(7L));
 }
}
