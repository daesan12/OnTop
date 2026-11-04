package com.ssafy.ontop.announcement.service;

public class AnnouncementConflictException extends RuntimeException {
    public AnnouncementConflictException() { super("공지가 변경되었습니다. 다시 조회한 뒤 수정해주세요."); }
}
