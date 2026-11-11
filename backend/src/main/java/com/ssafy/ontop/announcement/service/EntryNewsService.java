package com.ssafy.ontop.announcement.service;
import com.ssafy.ontop.announcement.domain.EntryNews;
import com.ssafy.ontop.announcement.dto.*;
import com.ssafy.ontop.announcement.repository.EntryNewsRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.*;

@Transactional
public class EntryNewsService {
    private final EntryNewsRepository repo; private final Clock clock; private final EntryNewsStorage storage;
    public EntryNewsService(EntryNewsRepository repo,Clock clock,EntryNewsStorage storage){this.repo=repo;this.clock=clock;this.storage=storage;}
    public record Feed(Instant serverTime,List<EntryNewsItem> pages){}
    private EntryNewsItem item(EntryNews n){return imageUrl(EntryNewsItem.from(n));}
    private EntryNewsItem imageUrl(EntryNewsItem n){return n.withImageUrl(n.imageUrl()==null?null:storage.url(n.imageUrl()));}
    @Transactional(readOnly=true) public List<EntryNewsItem> list(){return repo.items().stream().map(this::imageUrl).toList();}
    @Transactional(readOnly=true) public Feed feed(){var now=clock.instant();return new Feed(now,repo.items().stream().filter(n->n.published()&&(n.startsAt()==null||!now.isBefore(n.startsAt()))&&(n.endsAt()==null||now.isBefore(n.endsAt()))).map(this::imageUrl).toList());}
    @Transactional(readOnly=true) public byte[] image(String id,boolean admin){var n=require(id);if(!admin&&!n.visibleAt(clock.instant()))throw new ResponseStatusException(HttpStatus.NOT_FOUND);return n.getImageKey()==null?n.getImage():storage.read(n.getImageKey());}
    public EntryNewsItem save(String id,EntryNewsDraft d,EntryNewsStorage.VerifiedImage upload,boolean creating,long actor){
        if(!UUID.fromString(id).toString().equals(id)||d==null)throw new IllegalArgumentException("안내 ID와 내용을 확인해주세요.");d.validate();
        String hash=upload==null?null:upload.hash();
        if(upload!=null){storage.url(upload.key());if(hash==null||!hash.matches("[0-9a-f]{64}")||!upload.key().contains("/"+id+"/")||(!upload.key().endsWith("/"+hash+".png")&&!upload.key().endsWith("/"+hash+".jpg")))throw new IllegalArgumentException("안내 이미지 경로를 확인해주세요.");}
        var n=repo.find(id);boolean creatingEntity=false;
        if(creating){
            // Serialize additions with existing rows; the count cap is an operational guard, not security authority.
            if(d.expectedVersion()!=0||upload==null)throw new IllegalArgumentException("등록할 이미지를 선택해주세요.");
            if(n!=null){if(!n.same(d,hash))throw new AnnouncementConflictException();return item(n);}
            if(repo.lock().size()>=20)throw new IllegalArgumentException("안내는 최대 20장까지 보관할 수 있어요. 오래된 안내를 삭제해주세요.");
            n=new EntryNews(id,d,new byte[0],hash,actor,clock.instant());creatingEntity=true;
        }else{if(n==null||n.isDeleted()||n.getVersion()!=d.expectedVersion())throw new AnnouncementConflictException();n.change(d,upload==null?null:new byte[0],hash,actor,clock.instant());}
        if(upload!=null)n.useStorage(upload.key());
        if(creatingEntity)repo.add(n);
        repo.flush();return item(n);
    }
    public void remove(String id,long version,long actor){var n=require(id);if(version!=n.getVersion())throw new AnnouncementConflictException();n.remove(actor,clock.instant());repo.flush();}
    public void reorder(AnnouncementOrderRequest d,long actor){if(d==null)throw new IllegalArgumentException("순서를 확인해주세요.");d.validate();var all=repo.lock();if(all.size()!=d.items().size())throw new AnnouncementConflictException();
        var byId=new HashMap<String,EntryNews>();all.forEach(n->byId.put(n.getId(),n));
        for(var item:d.items()){var n=byId.get(item.id());if(n==null||n.getVersion()!=item.expectedVersion())throw new AnnouncementConflictException();}
        int order=0;for(var item:d.items())byId.get(item.id()).reorder(order++,actor,clock.instant());repo.flush();
    }
    private EntryNews require(String id){if(!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException("안내 ID를 확인해주세요.");var n=repo.find(id);if(n==null||n.isDeleted())throw new ResponseStatusException(HttpStatus.NOT_FOUND);return n;}
}
