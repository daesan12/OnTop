package com.ssafy.ontop.announcement.dto;
public record EntryNewsUploadRequest(long bytes,String sha256,String contentType) {
    public void validate(){if(bytes<12||bytes>2*1024*1024||sha256==null||!sha256.matches("[0-9a-f]{64}")||!("image/png".equals(contentType)||"image/jpeg".equals(contentType)))throw new IllegalArgumentException("PNG/JPEG, 2MB 이하 이미지 정보를 확인해주세요.");}
}
