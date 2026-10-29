package com.ssafy.ontop.notes;

import com.ssafy.ontop.notes.repository.NotesRepository;
import com.ssafy.ontop.notes.service.NotesChangeNotifier;
import com.ssafy.ontop.table.service.TableHub;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class NotesChangeNotifierTests {
    @Test void 알림실패는변경번호를앞당기지않고_DB재확인으로복구한다() {
        var repository = mock(NotesRepository.class);
        var transactions = mock(PlatformTransactionManager.class);
        when(transactions.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        when(repository.revision()).thenReturn(1L, 2L, 2L);
        var hub = mock(TableHub.class);
        doThrow(new IllegalStateException("검증용 송신 실패")).doNothing().when(hub).notesChanged(2L);
        var notifier = new NotesChangeNotifier(repository, transactions, hub);
        notifier.initialize();
        assertThatThrownBy(() -> notifier.committed(2)).isInstanceOf(IllegalStateException.class);
        notifier.reconcile(); notifier.reconcile(); notifier.committed(1);
        verify(hub, times(2)).notesChanged(2L);
        verifyNoMoreInteractions(hub);
    }
}
