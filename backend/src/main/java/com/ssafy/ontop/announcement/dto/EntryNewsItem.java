package com.ssafy.ontop.announcement.dto;
import com.ssafy.ontop.announcement.domain.EntryNews;
import java.time.Instant;
public record EntryNewsItem(String id,String title,boolean published,int displayOrder,@io.swagger.v3.oas.annotations.media.Schema(nullable=true) Instant startsAt,@io.swagger.v3.oas.annotations.media.Schema(nullable=true) Instant endsAt,long version,Instant updatedAt,String imageHash,@io.swagger.v3.oas.annotations.media.Schema(nullable=true) String imageUrl) {
    public static EntryNewsItem from(EntryNews n) { return new EntryNewsItem(n.getId(),n.getTitle(),n.isPublished(),n.getDisplayOrder(),n.getStartsAt(),n.getEndsAt(),n.getVersion(),n.getUpdatedAt(),n.getImageHash(),n.getImageKey()); }
    public EntryNewsItem withImageUrl(String url){return new EntryNewsItem(id,title,published,displayOrder,startsAt,endsAt,version,updatedAt,imageHash,url);}
}
