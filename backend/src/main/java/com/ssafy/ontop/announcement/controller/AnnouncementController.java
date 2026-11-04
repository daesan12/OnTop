package com.ssafy.ontop.announcement.controller;

import com.ssafy.ontop.announcement.dto.AnnouncementRequest;
import com.ssafy.ontop.announcement.dto.AnnouncementOrderRequest;
import com.ssafy.ontop.announcement.dto.AnnouncementResponse;
import com.ssafy.ontop.announcement.service.AnnouncementService;
import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.announcement.dto.PublicAnnouncementsResponse;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import java.security.Principal;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@Tag(name = "ANNOUNCEMENT")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "401", description = "로그인 필요", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
    @ApiResponse(responseCode = "403", description = "접근 권한 없음", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
    @ApiResponse(responseCode = "503", description = "공지 저장소 준비 중 또는 조회 실패", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
})
public class AnnouncementController {
    private final ObjectProvider<AnnouncementService> services;
    private final AdminAccessPolicy administrators;

    public AnnouncementController(ObjectProvider<AnnouncementService> services, AdminAccessPolicy administrators) {
        this.services = services;
        this.administrators = administrators;
    }

    @GetMapping("/api/v1/announcements")
    @Operation(summary = "회원 게시 공지 조회", description = "서버 시각 기준 현재 게시 본문만 표시 순서대로 반환합니다.")
    @ApiResponse(responseCode = "200", description = "게시 공지", content = @Content(mediaType = "application/json", schema = @Schema(implementation = PublicAnnouncementsResponse.class)))
    public ResponseEntity<PublicAnnouncementsResponse> visible(Principal principal) {
        member(principal);
        return response(service().visible());
    }

    @GetMapping("/api/v1/admin/operations/announcements")
    @Operation(summary = "관리자 전체 공지 조회", description = "운영 관리자 전용. 숨김·기간 종료 포함, 삭제 제외.")
    @ApiResponse(responseCode = "200", description = "전체 공지", content = @Content(mediaType = "application/json", array = @ArraySchema(schema = @Schema(implementation = AnnouncementResponse.class))))
    public ResponseEntity<List<AnnouncementResponse>> list(Principal principal) {
        administrator(principal);
        return response(service().list());
    }

    @PostMapping("/api/v1/admin/operations/announcements/{id}")
    @Operation(summary = "관리자 공지 생성·같은 ID 재시도")
    @ApiResponse(responseCode = "400", description = "ANNOUNCEMENT_INVALID", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "ANNOUNCEMENT_CONFLICT", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "200", description = "저장된 공지", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AnnouncementResponse.class)))
    public ResponseEntity<AnnouncementResponse> create(Principal principal, @Parameter(description = "공지 UUID", schema = @Schema(type = "string", format = "uuid", pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")) @PathVariable String id,
            @RequestBody AnnouncementRequest request) {
        long administrator = administrator(principal);
        return response(service().create(id, request, administrator));
    }

    @PutMapping("/api/v1/admin/operations/announcements/{id}")
    @Operation(summary = "관리자 공지 수정")
    @ApiResponse(responseCode = "400", description = "ANNOUNCEMENT_INVALID", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "ANNOUNCEMENT_CONFLICT", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "200", description = "저장된 공지", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AnnouncementResponse.class)))
    public ResponseEntity<AnnouncementResponse> update(Principal principal, @Parameter(description = "공지 UUID", schema = @Schema(type = "string", format = "uuid", pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")) @PathVariable String id,
            @RequestBody AnnouncementRequest request) {
        long administrator = administrator(principal);
        return response(service().update(id, request, administrator));
    }

    @DeleteMapping("/api/v1/admin/operations/announcements/{id}")
    @Operation(summary = "관리자 공지 삭제")
    @ApiResponse(responseCode = "400", description = "ANNOUNCEMENT_INVALID", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "ANNOUNCEMENT_CONFLICT", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "204", description = "처리 완료", content = @Content)
    public ResponseEntity<Void> remove(Principal principal, @Parameter(description = "공지 UUID", schema = @Schema(type = "string", format = "uuid", pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")) @PathVariable String id, @RequestParam long version) {
        long administrator = administrator(principal);
        service().remove(id, version, administrator);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PutMapping("/api/v1/admin/operations/announcements/order")
    @Operation(summary = "관리자 공지 카드 순서 일괄 저장")
    @ApiResponse(responseCode = "400", description = "ANNOUNCEMENT_INVALID", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "ANNOUNCEMENT_CONFLICT", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @ApiResponse(responseCode = "204", description = "처리 완료", content = @Content)
    public ResponseEntity<Void> reorder(Principal principal, @RequestBody AnnouncementOrderRequest request) {
        long administrator = administrator(principal);
        service().reorder(request, administrator);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private AnnouncementService service() {
        AnnouncementService value = services.getIfAvailable();
        if (value == null) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "공지 저장소 준비 중"); }
        return value;
    }

    private long member(Principal principal) {
        if (principal == null) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED); }
        try { return Long.parseLong(principal.getName()); }
        catch (NumberFormatException error) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED); }
    }

    private long administrator(Principal principal) {
        long id = member(principal);
        if (!administrators.canOperate(id)) { throw new ResponseStatusException(HttpStatus.FORBIDDEN); }
        return id;
    }

    private <T> ResponseEntity<T> response(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
