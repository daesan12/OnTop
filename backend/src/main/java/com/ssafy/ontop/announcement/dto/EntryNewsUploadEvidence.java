package com.ssafy.ontop.announcement.dto;
public record EntryNewsUploadEvidence(String uploadId,long bytes,String sha256,String contentType) {
    public void validate(){if(uploadId==null||!java.util.UUID.fromString(uploadId).toString().equals(uploadId))throw new IllegalArgumentException("업로드 ID를 확인해주세요.");new EntryNewsUploadRequest(bytes,sha256,contentType).validate();}
}
