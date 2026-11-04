package com.ssafy.ontop.announcement.controller;

import com.ssafy.ontop.announcement.dto.AnnouncementRequest;
import com.ssafy.ontop.announcement.dto.AnnouncementResponse;
import com.ssafy.ontop.announcement.service.AnnouncementService;
import com.ssafy.ontop.admin.security.AdminAccessPolicy;
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
public class AnnouncementController {
    private final ObjectProvider<AnnouncementService> services;
    private final AdminAccessPolicy administrators;

    public AnnouncementController(ObjectProvider<AnnouncementService> services, AdminAccessPolicy administrators) {
        this.services = services;
        this.administrators = administrators;
    }

    @GetMapping("/api/v1/announcements")
    public ResponseEntity<?> visible(Principal principal) {
        member(principal);
        return response(service().visible());
    }

    @GetMapping("/api/v1/admin/operations/announcements")
    public ResponseEntity<List<AnnouncementResponse>> list(Principal principal) {
        administrator(principal);
        return response(service().list());
    }

    @PostMapping("/api/v1/admin/operations/announcements/{id}")
    public ResponseEntity<AnnouncementResponse> create(Principal principal, @PathVariable String id,
            @RequestBody AnnouncementRequest request) {
        long administrator = administrator(principal);
        return response(service().create(id, request, administrator));
    }

    @PutMapping("/api/v1/admin/operations/announcements/{id}")
    public ResponseEntity<AnnouncementResponse> update(Principal principal, @PathVariable String id,
            @RequestBody AnnouncementRequest request) {
        long administrator = administrator(principal);
        return response(service().update(id, request, administrator));
    }

    @DeleteMapping("/api/v1/admin/operations/announcements/{id}")
    public ResponseEntity<Void> remove(Principal principal, @PathVariable String id, @RequestParam long version) {
        long administrator = administrator(principal);
        service().remove(id, version, administrator);
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
