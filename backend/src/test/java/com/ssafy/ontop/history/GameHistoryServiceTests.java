package com.ssafy.ontop.history;

import com.ssafy.ontop.history.dto.GameHistoryPageRequest;
import com.ssafy.ontop.history.dto.GameHistoryPageResponse;
import com.ssafy.ontop.history.exception.GameHistoryException;
import com.ssafy.ontop.history.repository.GameHistoryRepository;
import com.ssafy.ontop.history.service.GameHistoryService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameHistoryServiceTests {
    @Test
    void 한건_더_조회한_마지막_반환_ID만_커서로_사용한다() {
        var repository = mock(GameHistoryRepository.class);
        var service = service(repository);
        var request = new GameHistoryPageRequest(null, 2, null);
        when(repository.findHistory(42, request)).thenReturn(List.of(item("9"), item("7"), item("3")));

        var page = service.findHistory(42, request);

        assertThat(page.items()).extracting(GameHistoryPageResponse.Item::gameSessionId).containsExactly("9", "7");
        assertThat(page.nextCursor()).isEqualTo("7");
        assertThat(page.hasNext()).isTrue();
        verify(repository).findHistory(42, request);
    }

    @Test
    void 빈_결과는_null_커서와_빈_목록이다() {
        var repository = mock(GameHistoryRepository.class);
        var request = new GameHistoryPageRequest(1L, 20, "OMOK");
        when(repository.findHistory(42, request)).thenReturn(List.of());

        assertThat(service(repository).findHistory(42, request))
                .isEqualTo(new GameHistoryPageResponse(List.of(), null, false));
    }

    @Test
    void DB_미설정과_실패는_빈_성공_대신_503_계약이다() {
        assertStorage(() -> service(null).findStats(42));
        var repository = mock(GameHistoryRepository.class);
        when(repository.findStats(42)).thenThrow(new DataAccessResourceFailureException("sensitive-jdbc-details"));
        assertStorage(() -> service(repository).findStats(42));
    }

    private void assertStorage(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(GameHistoryException.class, error -> {
            assertThat(error.error()).isEqualTo(GameHistoryException.Error.STORAGE);
            assertThat(error.getMessage()).doesNotContain("sensitive-jdbc-details");
        });
    }

    private GameHistoryService service(GameHistoryRepository repository) {
        var beans = new StaticListableBeanFactory();
        if (repository != null) {
            beans.addBean("history", repository);
        }
        return new GameHistoryService(beans.getBeanProvider(GameHistoryRepository.class));
    }

    private GameHistoryPageResponse.Item item(String id) {
        return new GameHistoryPageResponse.Item(id, "OMOK", "FINISHED", "WIN", "SETTLED", Instant.EPOCH);
    }
}
