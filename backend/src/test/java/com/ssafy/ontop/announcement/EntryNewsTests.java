package com.ssafy.ontop.announcement;
import com.ssafy.ontop.announcement.domain.EntryNews;
import com.ssafy.ontop.announcement.dto.*;
import com.ssafy.ontop.announcement.repository.EntryNewsRepository;
import com.ssafy.ontop.announcement.service.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class EntryNewsTests {
 static final String ID="a78baf0b-0246-4391-adef-a247f90ac50a";
 final Instant now=Instant.parse("2026-11-10T03:00:00Z");
 final EntryNewsRepository repo=mock(EntryNewsRepository.class);
 final EntryNewsStorage storage=mock(EntryNewsStorage.class);
 final EntryNewsService service=new EntryNewsService(repo,Clock.fixed(now,ZoneOffset.UTC),storage);
 static byte[] png(int w,int h)throws Exception{var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB),"png",out);return out.toByteArray();}
 EntryNewsDraft draft(boolean visible,long v){return new EntryNewsDraft("업데이트",visible,0,null,null,v);}
 @Test void 게시기간과_숨김을_서버시간으로_판정한다(){
   var visible=new EntryNewsItem(ID,"소식",true,0,now,now.plusSeconds(1),0,now,"a".repeat(64),null);
   when(repo.items()).thenReturn(List.of(visible,new EntryNewsItem("other","숨김",false,1,null,null,0,now,"a".repeat(64),null),new EntryNewsItem("future","예약",true,2,now.plusSeconds(1),null,0,now,"a".repeat(64),null)));
   assertThat(service.feed().pages()).containsExactly(visible);
   verify(repo,never()).list();
 }
 @Test void 같은_생성요청은_하나의_안내로_재확인한다()throws Exception{
   byte[] bytes=png(1200,675);String hash="a".repeat(64);var upload=new EntryNewsStorage.VerifiedImage("entry-news/local/published/7/"+ID+"/"+ID+"/"+hash+".png",hash);
   when(repo.find(ID)).thenReturn(new EntryNews(ID,draft(true,0),bytes,hash,7,now));
   assertThat(service.save(ID,draft(true,0),upload,true,7).id()).isEqualTo(ID);verify(repo,never()).add(any());
   assertThatThrownBy(()->service.save(ID,draft(false,0),upload,true,7)).isInstanceOf(AnnouncementConflictException.class);
 }
 @Test void 오래된_수정버전과_중복순서를_거절한다()throws Exception{
   when(repo.find(ID)).thenReturn(new EntryNews(ID,draft(true,0),png(1200,675),"a".repeat(64),7,now));
   assertThatThrownBy(()->service.save(ID,draft(false,1),null,false,7)).isInstanceOf(AnnouncementConflictException.class);
   var item=new AnnouncementOrderRequest.Item(ID,0);
   assertThatThrownBy(()->service.reorder(new AnnouncementOrderRequest(List.of(item,item)),7)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void 숨김이미지는_회원이_직접_읽을_수_없다()throws Exception{
   when(repo.find(ID)).thenReturn(new EntryNews(ID,draft(false,0),png(1200,675),"a".repeat(64),7,now));
   assertThatThrownBy(()->service.image(ID,false)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
   assertThat(service.image(ID,true)).isNotEmpty();
 }
}
