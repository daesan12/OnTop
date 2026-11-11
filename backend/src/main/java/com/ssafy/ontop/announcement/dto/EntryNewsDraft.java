package com.ssafy.ontop.announcement.dto;
import java.time.Instant;
public record EntryNewsDraft(String title,boolean published,int displayOrder,@io.swagger.v3.oas.annotations.media.Schema(nullable=true) Instant startsAt,@io.swagger.v3.oas.annotations.media.Schema(nullable=true) Instant endsAt,long expectedVersion) {
    public void validate() {
        if(title==null||title.isBlank()||title.strip().length()>80||displayOrder<0||displayOrder>9999||expectedVersion<0
            ||(startsAt!=null&&endsAt!=null&&!endsAt.isAfter(startsAt))) throw new IllegalArgumentException("제목·게시 기간·순서를 확인해주세요.");
    }
}
