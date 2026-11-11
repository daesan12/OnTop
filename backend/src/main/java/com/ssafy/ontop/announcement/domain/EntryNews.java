package com.ssafy.ontop.announcement.domain;

import com.ssafy.ontop.announcement.dto.EntryNewsDraft;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.Arrays;

@Entity
@Table(name="entry_news")
public class EntryNews {
    @Id @Column(length=36,columnDefinition="char(36)") private String id;
    @Column(nullable=false,length=80) private String title;
    @Lob @Column(nullable=false,columnDefinition="mediumblob") private byte[] image;
    @Column(name="image_hash",nullable=false,length=64,columnDefinition="char(64)") private String imageHash;
    @Column(name="image_key",length=512) private String imageKey;
    private boolean published;
    @Column(name="display_order") private int displayOrder;
    private Instant startsAt;
    private Instant endsAt;
    private boolean deleted;
    @Version private long version;
    private Instant updatedAt;
    private long updatedBy;
    protected EntryNews() { }
    public EntryNews(String id,EntryNewsDraft draft,byte[] image,String hash,long actor,Instant now) {
        this.id=id; change(draft,image,hash,actor,now);
    }
    public void change(EntryNewsDraft d,byte[] bytes,String hash,long actor,Instant now) {
        title=d.title().strip(); published=d.published(); displayOrder=d.displayOrder();
        startsAt=d.startsAt(); endsAt=d.endsAt(); updatedBy=actor; updatedAt=now;
        if(bytes!=null) { image=Arrays.copyOf(bytes,bytes.length); imageHash=hash; }
    }
    public boolean same(EntryNewsDraft d,String hash) {
        return !deleted&&version==0&&title.equals(d.title().strip())&&imageHash.equals(hash)
            &&published==d.published()&&displayOrder==d.displayOrder()
            &&java.util.Objects.equals(startsAt,d.startsAt())&&java.util.Objects.equals(endsAt,d.endsAt());
    }
    public boolean visibleAt(Instant now) { return !deleted&&published&&(startsAt==null||!now.isBefore(startsAt))&&(endsAt==null||now.isBefore(endsAt)); }
    public void remove(long actor,Instant now) { deleted=true; updatedBy=actor; updatedAt=now; }
    public void reorder(int order,long actor,Instant now) { displayOrder=order; updatedBy=actor; updatedAt=now; }
    public String getId(){return id;} public String getTitle(){return title;} public byte[] getImage(){return image.clone();}
    public String getImageHash(){return imageHash;} public boolean isPublished(){return published;} public boolean isDeleted(){return deleted;}
    public String getImageKey(){return imageKey;}
    public void useStorage(String key){imageKey=key;image=new byte[0];}
    public int getDisplayOrder(){return displayOrder;} public Instant getStartsAt(){return startsAt;} public Instant getEndsAt(){return endsAt;}
    public long getVersion(){return version;} public Instant getUpdatedAt(){return updatedAt;}
}
