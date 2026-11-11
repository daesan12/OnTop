package com.ssafy.ontop.announcement;
import com.ssafy.ontop.announcement.dto.*;
import com.ssafy.ontop.announcement.service.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import static org.assertj.core.api.Assertions.*;
@Tag("mysql")
@SpringBootTest
@ActiveProfiles({"local","db"})
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class EntryNewsMySqlTests {
 @Autowired EntryNewsService service;
 @org.springframework.test.context.bean.override.mockito.MockitoBean EntryNewsStorage storage;
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){String url=System.getenv("TEST_ENTRY_NEWS_DB_URL");if(url==null||!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_entry_news_test_[A-Za-z0-9_]+(?:\\?.*)?"))throw new IllegalStateException("접속 안내 전용 loopback 검증 DB가 필요합니다.");r.add("spring.datasource.url",()->url);r.add("spring.datasource.username",()->"root");r.add("spring.datasource.password",()->System.getenv().getOrDefault("TEST_ENTRY_NEWS_DB_PASSWORD",""));r.add("spring.flyway.locations",()->"classpath:db/migration,classpath:db/minigame,classpath:db/shop");}
 @Test void 실제_이미지저장_재조회_수정충돌_삭제와_순서를_검증한다()throws Exception{
  String a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString();byte[] image=EntryNewsTests.png(1200,675);
  var uploadA=new EntryNewsStorage.VerifiedImage("entry-news/local/published/7/"+a+"/"+a+"/"+"a".repeat(64)+".png","a".repeat(64));
  var uploadB=new EntryNewsStorage.VerifiedImage("entry-news/local/published/7/"+b+"/"+b+"/"+"a".repeat(64)+".png","a".repeat(64));
  org.mockito.Mockito.doReturn("https://cdn.example.invalid/entry-news/test.png").when(storage).url(org.mockito.ArgumentMatchers.anyString());
  org.mockito.Mockito.when(storage.read(org.mockito.ArgumentMatchers.anyString())).thenReturn(image);
  var first=service.save(a,new EntryNewsDraft("첫 소식",true,0,null,null,0),uploadA,true,7);
  var second=service.save(b,new EntryNewsDraft("둘째 소식",true,1,null,null,0),uploadB,true,7);
  assertThat(service.image(a,false)).isEqualTo(image);
  assertThat(service.save(a,new EntryNewsDraft("첫 소식",true,0,null,null,0),uploadA,true,7).id()).isEqualTo(a);
  service.reorder(new AnnouncementOrderRequest(List.of(new AnnouncementOrderRequest.Item(b,second.version()),new AnnouncementOrderRequest.Item(a,first.version()))),7);
  assertThat(service.feed().pages()).extracting(EntryNewsItem::id).containsExactly(b,a);
  assertThat(service.feed().pages().getFirst().imageUrl()).startsWith("https://");
  var before=service.list().getFirst();
  org.mockito.Mockito.doThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)).when(storage).url(uploadB.key());
  assertThatThrownBy(()->service.save(b,new EntryNewsDraft("실패할 수정",true,0,null,null,before.version()),uploadB,false,7)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  org.mockito.Mockito.doReturn("https://cdn.example.invalid/entry-news/test.png").when(storage).url(org.mockito.ArgumentMatchers.anyString());
  assertThat(service.list().getFirst().title()).isEqualTo(before.title());
  assertThatThrownBy(()->service.save(a,new EntryNewsDraft("오래된 수정",true,0,null,null,0),null,false,7)).isInstanceOf(AnnouncementConflictException.class);
  var updated=service.list().stream().filter(n->n.id().equals(a)).findFirst().orElseThrow();service.remove(a,updated.version(),7);
  assertThat(service.list()).extracting(EntryNewsItem::id).containsExactly(b);
 }
}
