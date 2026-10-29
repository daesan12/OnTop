package com.ssafy.ontop.notes;

import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.notes.config.NotesConfiguration;
import com.ssafy.ontop.notes.controller.NotesController;
import com.ssafy.ontop.notes.repository.NotesRepository;
import com.ssafy.ontop.notes.service.NotesService;
import com.ssafy.ontop.table.service.TableHub;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.junit.jupiter.api.BeforeEach;
import jakarta.persistence.TypedQuery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

class NotesProductionProfileTests {
    private final EntityManager entities = mock(EntityManager.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);

    @BeforeEach
    void 메모변경번호_초기조회가_가능한_DB대역을_준비한다() {
        TypedQuery<Long> revision = mock(TypedQuery.class);
        when(entities.createQuery("select b.revision from NoteBoard b where b.id=1", Long.class)).thenReturn(revision);
        when(revision.getSingleResult()).thenReturn(0L);
        when(transactions.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
    }

    private final WebApplicationContextRunner runner = new WebApplicationContextRunner()
            .withBean(EntityManager.class, () -> entities)
            .withBean(PlatformTransactionManager.class, () -> transactions)
            .withBean(BehaviorLog.class, BehaviorLog::disabled)
            .withBean(TableHub.class, () -> mock(TableHub.class))
            .withUserConfiguration(NotesConfiguration.class, NotesController.class);

    @Test
    void 운영에서는_메모를_명시적으로_켜야_등록한다() {
        runner.withPropertyValues("spring.profiles.active=prod,db")
                .run(context -> assertThat(context).hasNotFailed()
                        .doesNotHaveBean(NotesController.class).doesNotHaveBean(NotesService.class));
    }

    @Test
    void 운영DB에서_비밀키를_설정하고_켜면_메모를_등록한다() {
        runner.withPropertyValues("spring.profiles.active=prod,db", "ontop.notes.enabled=true",
                "ontop.notes.privacy-secret=abcdefghijklmnopqrstuvwxyz012345")
                .run(context -> assertThat(context).hasNotFailed()
                        .hasSingleBean(NotesController.class).hasSingleBean(NotesRepository.class)
                        .hasSingleBean(NotesService.class));
    }
}
