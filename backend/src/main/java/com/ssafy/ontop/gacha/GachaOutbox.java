package com.ssafy.ontop.gacha;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.gacha.GachaDtos.Event;
import jakarta.annotation.PostConstruct;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 노드별 전달 커서. DB 잠금 밖에서 방송하고, 성공 후에만 커서를 진행한다. */
public class GachaOutbox {
    private static final Logger LOG=LoggerFactory.getLogger(GachaOutbox.class);
    private final GachaRepository repository;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;
    private final String node;
    private final Consumer<Event> broadcast;
    private final AtomicBoolean draining=new AtomicBoolean();
    public GachaOutbox(GachaRepository repository,PlatformTransactionManager manager,ObjectMapper json,
            String node,Consumer<Event> broadcast) {
        if(node==null||!node.matches("[A-Za-z0-9_.:-]{1,120}")) throw new IllegalArgumentException("뽑기 방송 노드 ID를 확인하세요.");
        this.repository=repository; transactions=new TransactionTemplate(manager); this.json=json; this.node=node; this.broadcast=broadcast;
    }
    @PostConstruct public void initialize() { transactions.executeWithoutResult(s->repository.ensureCursor(node)); }
    @Scheduled(fixedDelay=500,initialDelay=500)
    public void deliver() {
        if(!draining.compareAndSet(false,true)) return;
        try {
            var pending=transactions.execute(s->repository.deliveries(node));
            if(pending==null) return;
            for(var entry:pending) {
                Event event=json.readValue(entry.json(),Event.class);
                broadcast.accept(event);
                transactions.executeWithoutResult(s->repository.acknowledge(node,entry.id()));
            }
        } catch(Exception failure) {
            LOG.warn("뽑기 공지 전달 재시도 대기: {}",failure.getClass().getSimpleName());
        } finally { draining.set(false); }
    }
}
