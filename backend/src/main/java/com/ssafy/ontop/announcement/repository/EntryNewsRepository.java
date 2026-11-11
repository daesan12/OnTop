package com.ssafy.ontop.announcement.repository;
import com.ssafy.ontop.announcement.domain.EntryNews;
import com.ssafy.ontop.announcement.dto.EntryNewsItem;
import jakarta.persistence.*;
import java.util.List;
public class EntryNewsRepository {
    private final EntityManager em;
    public EntryNewsRepository(EntityManager em){this.em=em;}
    public List<EntryNews> list(){return em.createQuery("select n from EntryNews n where n.deleted=false order by n.displayOrder,n.id",EntryNews.class).getResultList();}
    public List<EntryNewsItem> items(){return em.createQuery("select new com.ssafy.ontop.announcement.dto.EntryNewsItem(n.id,n.title,n.published,n.displayOrder,n.startsAt,n.endsAt,n.version,n.updatedAt,n.imageHash,n.imageKey) from EntryNews n where n.deleted=false order by n.displayOrder,n.id",EntryNewsItem.class).getResultList();}
    public List<EntryNews> lock(){return em.createQuery("select n from EntryNews n where n.deleted=false order by n.id",EntryNews.class).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();}
    public EntryNews find(String id){return em.find(EntryNews.class,id);}
    public void add(EntryNews n){em.persist(n);}
    public void flush(){em.flush();}
}
