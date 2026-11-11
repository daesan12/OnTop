package com.ssafy.ontop.announcement;
import com.ssafy.ontop.announcement.service.*;
import com.ssafy.ontop.announcement.domain.EntryNews;
import com.ssafy.ontop.announcement.dto.EntryNewsDraft;
import com.ssafy.ontop.announcement.repository.EntryNewsRepository;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class EntryNewsStorageTests {
 @Test void 저장은_S3키만_보관하고_이미지_URL은_설정된_CDN으로_생성한다()throws Exception{
  var repo=mock(EntryNewsRepository.class);var storage=mock(EntryNewsStorage.class);String id="a78baf0b-0246-4391-adef-a247f90ac50a",key="entry-news/local/published/7/"+id+"/"+id+"/"+"a".repeat(64)+".png";
  when(repo.lock()).thenReturn(List.of());when(storage.url(key)).thenReturn("https://cdn.example.invalid/"+key);
  var service=new EntryNewsService(repo,Clock.systemUTC(),storage);
  var result=service.save(id,new EntryNewsDraft("업데이트",true,0,null,null,0),new EntryNewsStorage.VerifiedImage(key,"a".repeat(64)),true,7);
  var value=ArgumentCaptor.forClass(EntryNews.class);verify(repo).add(value.capture());assertThat(value.getValue().getImage()).isEmpty();assertThat(value.getValue().getImageKey()).isEqualTo(key);assertThat(result.imageUrl()).startsWith("https://cdn.example.invalid/entry-news/local/");
 }
 @Test void 미설정은_외부호출_없이_503이고_임의_CDN과_경로는_거절한다(){
  try(var storage=new EntryNewsStorage("","ap-northeast-2","","local")){assertThatThrownBy(()->storage.signUpload("a78baf0b-0246-4391-adef-a247f90ac50a",7,new com.ssafy.ontop.announcement.dto.EntryNewsUploadRequest(20,"a".repeat(64),"image/png"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);}
  assertThatThrownBy(()->new EntryNewsStorage("","ap-northeast-2","javascript:alert(1)","local")).isInstanceOf(IllegalArgumentException.class);
 }
}
