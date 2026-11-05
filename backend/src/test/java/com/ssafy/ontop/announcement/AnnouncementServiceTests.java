package com.ssafy.ontop.announcement;

import com.ssafy.ontop.announcement.domain.Announcement;
import com.ssafy.ontop.announcement.dto.AnnouncementRequest;
import com.ssafy.ontop.announcement.dto.AnnouncementOrderRequest;
import com.ssafy.ontop.announcement.repository.AnnouncementRepository;
import com.ssafy.ontop.announcement.service.AnnouncementConflictException;
import com.ssafy.ontop.announcement.service.AnnouncementService;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AnnouncementServiceTests {
    private final Instant now = Instant.parse("2026-11-04T03:00:00Z");
    private final String id = "a78baf0b-0246-4391-adef-a247f90ac50a";
    private final AnnouncementRepository repository = mock(AnnouncementRepository.class);
    private final AnnouncementService service = new AnnouncementService(repository, Clock.fixed(now, ZoneOffset.UTC));
    private AnnouncementRequest request(boolean published, Instant start, Instant end, long version) {
        return new AnnouncementRequest("제목", "내용", published, 1, start, end, version);
    }
    @Test void 게시_기간은_시작_포함_종료_제외이며_비공개와_삭제는_숨긴다() {
        var value = new Announcement(id, request(true, now, now.plusSeconds(5), 0), 7, now);
        assertThat(value.visibleAt(now.minusMillis(1))).isFalse();
        assertThat(value.visibleAt(now)).isTrue();
        assertThat(value.visibleAt(now.plusSeconds(5))).isFalse();
        value.remove(7, now); assertThat(value.visibleAt(now)).isFalse();
        assertThat(new Announcement(id, request(false, null, null, 0), 7, now).visibleAt(now)).isFalse();
    }
    @Test void 공개_응답은_활성_본문만_보내고_가장_가까운_예약_시각에_재조회한다() {
        var active = new Announcement(id, request(true, null, now.plusSeconds(9), 0), 7, now);
        var future = new Announcement("b78baf0b-0246-4391-adef-a247f90ac50a", request(true, now.plusSeconds(2), null, 0), 7, now);
        var hidden = new Announcement("c78baf0b-0246-4391-adef-a247f90ac50a", request(false, null, null, 0), 7, now);
        when(repository.list()).thenReturn(List.of(active, future, hidden));
        var response = service.visible();
        assertThat(response.serverTime()).isEqualTo(now);
        assertThat(response.refreshAt()).isEqualTo(now.plusSeconds(2));
        assertThat(response.announcements()).hasSize(1);
        assertThat(response.announcements().getFirst().text()).isEqualTo("내용");
    }
    @Test void 생성_재시도는_같은_ID와_본문이면_중복_저장하지_않는다() {
        var request = request(true, null, null, 0);
        var value = new Announcement(id, request, 7, now);
        when(repository.find(id)).thenReturn(value);
        assertThat(service.create(id, request, 7).id()).isEqualTo(id);
        verify(repository, never()).add(any());
        assertThatThrownBy(() -> service.create(id, request(false, null, null, 0), 7)).isInstanceOf(AnnouncementConflictException.class);
        value.remove(7, now);
        assertThatThrownBy(() -> service.create(id, request, 7)).isInstanceOf(AnnouncementConflictException.class);
    }
    @Test void 오래된_버전은_수정과_삭제를_거절하고_삭제_재시도는_허용한다() {
        var value = new Announcement(id, request(true, null, null, 0), 7, now);
        when(repository.find(id)).thenReturn(value);
        assertThatThrownBy(() -> service.update(id, request(false, null, null, 1), 7)).isInstanceOf(AnnouncementConflictException.class);
        assertThatThrownBy(() -> service.remove(id, 1, 7)).isInstanceOf(AnnouncementConflictException.class);
        service.remove(id, 0, 7); service.remove(id, 0, 7);
        verify(repository, times(1)).flush();
    }
    @Test void 잘못된_내용과_기간은_저장하지_않는다() {
        assertThatThrownBy(() -> service.create(id, request(true, now, now, 0), 7)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.create(id, new AnnouncementRequest(" ", "본문", false, 0, null, null, 0), 7)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.create("bad", request(true, null, null, 0), 7)).isInstanceOf(IllegalArgumentException.class);
        verify(repository, never()).add(any());
    }

    @Test void 관리자_목록은_지난_공지와_숨긴_공지까지_보관한다() {
        var ended = new Announcement(id, request(true, null, now.minusSeconds(1), 0), 7, now);
        var hidden = new Announcement("b78baf0b-0246-4391-adef-a247f90ac50a", request(false, null, null, 0), 7, now);
        when(repository.list()).thenReturn(List.of(ended, hidden));
        assertThat(service.list()).hasSize(2);
        assertThat(service.visible().announcements()).isEmpty();
    }
    @Test void 카드_순서는_내용과_게시기간을_유지하며_일괄_저장한다() {
        var first = new Announcement(id, request(true, null, now.plusSeconds(60), 0), 7, now);
        var second = new Announcement("b78baf0b-0246-4391-adef-a247f90ac50a", request(false, null, null, 0), 7, now);
        when(repository.listForUpdate()).thenReturn(List.of(first, second));
        service.reorder(new AnnouncementOrderRequest(List.of(new AnnouncementOrderRequest.Item(second.getId(), 0),
                new AnnouncementOrderRequest.Item(id, 0))), 7);
        assertThat(second.getDisplayOrder()).isZero();
        assertThat(first.getDisplayOrder()).isEqualTo(1);
        assertThat(first.getText()).isEqualTo("내용");
        assertThat(first.getEndsAt()).isEqualTo(now.plusSeconds(60));
        assertThat(second.isPublished()).isFalse();
        verify(repository).flush();
    }
    @Test void 중복이나_누락_오래된_버전은_어느_순서도_바꾸기_전에_거절한다() {
        var first = new Announcement(id, request(true, null, null, 0), 7, now);
        var second = new Announcement("b78baf0b-0246-4391-adef-a247f90ac50a", request(false, null, null, 0), 7, now);
        when(repository.listForUpdate()).thenReturn(List.of(first, second));
        var item = new AnnouncementOrderRequest.Item(id, 0);
        assertThatThrownBy(() -> service.reorder(new AnnouncementOrderRequest(List.of(item, item)), 7))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.reorder(new AnnouncementOrderRequest(List.of(item)), 7))
                .isInstanceOf(AnnouncementConflictException.class);
        assertThatThrownBy(() -> service.reorder(new AnnouncementOrderRequest(List.of(item,
                new AnnouncementOrderRequest.Item(second.getId(), 1))), 7)).isInstanceOf(AnnouncementConflictException.class);
        assertThat(first.getDisplayOrder()).isEqualTo(1);
        assertThat(second.getDisplayOrder()).isEqualTo(1);
        verify(repository, never()).flush();
    }
}
