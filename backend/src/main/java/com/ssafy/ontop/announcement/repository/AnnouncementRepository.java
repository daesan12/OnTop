package com.ssafy.ontop.announcement.repository;

import com.ssafy.ontop.announcement.domain.Announcement;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;

public class AnnouncementRepository {
    private final EntityManager entities;

    public AnnouncementRepository(EntityManager entities) { this.entities = entities; }

    public List<Announcement> list() {
        return entities.createQuery("select a from Announcement a where a.deleted = false "
                + "order by a.displayOrder, a.id", Announcement.class).getResultList();
    }

    public Announcement find(String id) { return entities.find(Announcement.class, id); }
    public List<Announcement> listForUpdate() {
        return entities.createQuery("select a from Announcement a where a.deleted = false order by a.id", Announcement.class)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
    public void add(Announcement value) { entities.persist(value); }
    public void flush() { entities.flush(); }
}
