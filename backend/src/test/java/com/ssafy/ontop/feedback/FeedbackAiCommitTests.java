package com.ssafy.ontop.feedback;

import com.ssafy.ontop.feedback.config.FeedbackProperties;
import com.ssafy.ontop.feedback.domain.FeedbackText;
import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import com.ssafy.ontop.feedback.service.FeedbackService;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Clock;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FeedbackAiCommitTests {
    @Test void aiReceivesOnlyCommittedNewFeedback() {
        var calls=new AtomicInteger();
        var service=service(false,calls);
        service.submit(101,"one","channel-1",new FeedbackText("전체 접속이 안돼요"));
        assertThat(calls.get()).isEqualTo(1);
    }
    @Test void failedCommitDoesNotSendAnAiNotification() {
        var calls=new AtomicInteger();
        var service=service(true,calls);
        assertThatThrownBy(() -> service.submit(101,"one","channel-1",new FeedbackText("전체 접속이 안돼요"))).isInstanceOf(IllegalStateException.class);
        assertThat(calls.get()).isZero();
    }
    private FeedbackService service(boolean fail,AtomicInteger calls) {
        var repository=mock(FeedbackRepository.class);
        when(repository.lockActiveMember(101)).thenReturn(true);
        doAnswer(invocation -> {
            var field=FeedbackMessage.class.getDeclaredField("id"); field.setAccessible(true); field.set(invocation.getArgument(0),1L); return null;
        }).when(repository).save(any());
        var manager=new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new Object(); }
            @Override protected void doBegin(Object t,org.springframework.transaction.TransactionDefinition d) { }
            @Override protected void doCommit(DefaultTransactionStatus s) { if(fail) throw new IllegalStateException("fixture commit failure"); }
            @Override protected void doRollback(DefaultTransactionStatus s) { }
        };
        var service=new FeedbackService(repository,manager,mock(TableHub.class),new FeedbackProperties(Set.of(),null,null,null),Clock.systemUTC());
        service.ai(event -> { assertThat(event.id()).isEqualTo("1"); calls.incrementAndGet(); });
        return service;
    }
}
