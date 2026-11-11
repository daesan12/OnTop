package com.ssafy.ontop.announcement.controller;

import com.ssafy.ontop.announcement.service.AnnouncementConflictException;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import jakarta.persistence.OptimisticLockException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {AnnouncementController.class, EntryNewsController.class})
public class AnnouncementExceptionHandler {
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<AuthErrorResponse> invalid(IllegalArgumentException error) {
        return error(400, "ANNOUNCEMENT_INVALID", error.getMessage());
    }

    @ExceptionHandler({AnnouncementConflictException.class, OptimisticLockException.class,
            OptimisticLockingFailureException.class, org.springframework.dao.DataIntegrityViolationException.class})
    ResponseEntity<AuthErrorResponse> conflict(Exception cause) {
        return error(409, "ANNOUNCEMENT_CONFLICT", "공지가 변경되었습니다. 다시 조회해주세요.");
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<AuthErrorResponse> unavailable(DataAccessException cause) {
        return error(503, "ANNOUNCEMENT_UNAVAILABLE", "공지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }

    private ResponseEntity<AuthErrorResponse> error(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new AuthErrorResponse(code, message));
    }
}
