package com.ssafy.ontop.announcement.domain;

import com.ssafy.ontop.announcement.dto.AnnouncementRequest;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;

@Entity
@Table(name = "announcements")
public class Announcement {
    @Id
    @Column(length = 36, columnDefinition = "char(36)")
    private String id;
    @Column(nullable = false, length = 80)
    private String title;
    @Column(nullable = false, length = 1000)
    private String text;
    @Column(nullable = false)
    private boolean published;
    @Column(name = "display_order", nullable = false)
    private int displayOrder;
    @Column(name = "starts_at")
    private Instant startsAt;
    @Column(name = "ends_at")
    private Instant endsAt;
    @Column(nullable = false)
    private boolean deleted;
    @Version
    private long version;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(name = "updated_by", nullable = false)
    private long updatedBy;

    protected Announcement() { }

    public Announcement(String id, AnnouncementRequest request, long administratorId, Instant now) {
        this.id = id;
        change(request, administratorId, now);
    }

    public void change(AnnouncementRequest request, long administratorId, Instant now) {
        request.validate();
        title = request.title().strip();
        text = request.text().strip();
        published = request.published();
        displayOrder = request.displayOrder();
        startsAt = request.startsAt();
        endsAt = request.endsAt();
        updatedBy = administratorId;
        updatedAt = now;
    }

    public boolean sameContent(AnnouncementRequest request) {
        return title.equals(request.title().strip()) && text.equals(request.text().strip())
                && published == request.published() && displayOrder == request.displayOrder()
                && java.util.Objects.equals(startsAt, request.startsAt())
                && java.util.Objects.equals(endsAt, request.endsAt());
    }

    public boolean visibleAt(Instant now) {
        return !deleted && published && (startsAt == null || !now.isBefore(startsAt))
                && (endsAt == null || now.isBefore(endsAt));
    }

    public void remove(long administratorId, Instant now) {
        deleted = true;
        updatedBy = administratorId;
        updatedAt = now;
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public String getText() { return text; }
    public boolean isPublished() { return published; }
    public int getDisplayOrder() { return displayOrder; }
    public Instant getStartsAt() { return startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public boolean isDeleted() { return deleted; }
    public long getVersion() { return version; }
    public Instant getUpdatedAt() { return updatedAt; }
}
