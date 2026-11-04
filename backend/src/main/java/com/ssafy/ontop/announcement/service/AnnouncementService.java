package com.ssafy.ontop.announcement.service;

import com.ssafy.ontop.announcement.domain.Announcement;
import com.ssafy.ontop.announcement.dto.AnnouncementRequest;
import com.ssafy.ontop.announcement.dto.AnnouncementOrderRequest;
import com.ssafy.ontop.announcement.dto.AnnouncementResponse;
import com.ssafy.ontop.announcement.dto.PublicAnnouncementsResponse;
import com.ssafy.ontop.announcement.repository.AnnouncementRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.transaction.annotation.Transactional;

@Transactional
public class AnnouncementService {
    private final AnnouncementRepository repository;
    private final Clock clock;

    public AnnouncementService(AnnouncementRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<AnnouncementResponse> list() {
        return repository.list().stream().map(AnnouncementResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public PublicAnnouncementsResponse visible() {
        Instant now = clock.instant();
        List<Announcement> all = repository.list();
        Instant refreshAt = now.plusSeconds(10);
        for (Announcement value : all) {
            if (!value.isPublished()) { continue; }
            if (value.getStartsAt() != null && value.getStartsAt().isAfter(now)
                    && value.getStartsAt().isBefore(refreshAt)) { refreshAt = value.getStartsAt(); }
            if (value.getEndsAt() != null && value.getEndsAt().isAfter(now)
                    && value.getEndsAt().isBefore(refreshAt)) { refreshAt = value.getEndsAt(); }
        }
        return new PublicAnnouncementsResponse(now, refreshAt, all.stream().filter(value -> value.visibleAt(now))
                .map(value -> new PublicAnnouncementsResponse.Item(value.getId(), value.getText(),
                        value.getEndsAt(), value.getVersion())).toList());
    }

    // 클라이언트가 생성한 UUID를 재사용하므로 생성 응답이 유실돼도 같은 공지가 중복 생성되지 않는다.
    public AnnouncementResponse create(String id, AnnouncementRequest request, long administratorId) {
        validate(id, request);
        if (request.expectedVersion() != 0) { throw new AnnouncementConflictException(); }
        Announcement existing = repository.find(id);
        if (existing != null) {
            if (existing.isDeleted() || existing.getVersion() != 0 || !existing.sameContent(request)) {
                throw new AnnouncementConflictException();
            }
            return AnnouncementResponse.from(existing);
        }
        Announcement value = new Announcement(id, request, administratorId, clock.instant());
        repository.add(value);
        repository.flush();
        return AnnouncementResponse.from(value);
    }

    public AnnouncementResponse update(String id, AnnouncementRequest request, long administratorId) {
        validate(id, request);
        Announcement value = repository.find(id);
        if (value == null || value.isDeleted() || value.getVersion() != request.expectedVersion()) {
            throw new AnnouncementConflictException();
        }
        value.change(request, administratorId, clock.instant());
        repository.flush();
        return AnnouncementResponse.from(value);
    }

    public void remove(String id, long expectedVersion, long administratorId) {
        UUID.fromString(id);
        Announcement value = repository.find(id);
        if (value == null || value.isDeleted()) { return; }
        if (expectedVersion < 0 || value.getVersion() != expectedVersion) { throw new AnnouncementConflictException(); }
        value.remove(administratorId, clock.instant());
        repository.flush();
    }

    // 모든 버전을 먼저 확인한 뒤 같은 트랜잭션에서 순서를 반영한다. 중간 실패 시 부분 저장하지 않는다.
    public void reorder(AnnouncementOrderRequest request, long administratorId) {
        if (request == null) { throw new IllegalArgumentException("공지 순서를 확인해주세요."); }
        request.validate();
        var values = repository.listForUpdate().stream()
                .collect(Collectors.toMap(Announcement::getId, Function.identity()));
        if (values.size() != request.items().size()) { throw new AnnouncementConflictException(); }
        for (var item : request.items()) {
            var value = values.get(item.id());
            if (value == null || value.getVersion() != item.expectedVersion()) { throw new AnnouncementConflictException(); }
        }
        var now = clock.instant();
        for (int order = 0; order < request.items().size(); order++) {
            values.get(request.items().get(order).id()).reorder(order, administratorId, now);
        }
        repository.flush();
    }

    private void validate(String id, AnnouncementRequest request) {
        if (!UUID.fromString(id).toString().equals(id) || request == null) {
            throw new IllegalArgumentException("공지 ID와 내용을 확인해주세요.");
        }
        request.validate();
    }
}
