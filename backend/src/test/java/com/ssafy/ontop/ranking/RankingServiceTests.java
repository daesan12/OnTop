package com.ssafy.ontop.ranking;

import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.repository.RankingRepository;
import com.ssafy.ontop.ranking.service.RankingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.transaction.CannotCreateTransactionException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RankingServiceTests {
    @Test
    void DB프로필이_없으면_빈성공대신_사용불가를_알린다() {
        var beans = new DefaultListableBeanFactory();
        var service = new RankingService(beans.getBeanProvider(RankingRepository.class));

        assertThatThrownBy(() -> service.findRankings(42, 20)).isInstanceOfSatisfying(
                RankingException.class, error -> assertThat(error.error().code())
                        .isEqualTo("RANKING_UNAVAILABLE"));
    }

    @Test
    void 트랜잭션_시작실패도_내부접속정보를_숨긴다() {
        var beans = new DefaultListableBeanFactory();
        var repository = mock(RankingRepository.class);
        beans.registerSingleton("rankings", repository);
        when(repository.findStandings(42, 20)).thenThrow(new CannotCreateTransactionException("private-db"));
        var service = new RankingService(beans.getBeanProvider(RankingRepository.class));

        assertThatThrownBy(() -> service.findRankings(42, 20)).isInstanceOf(RankingException.class)
                .hasMessage("랭킹 정보를 조회할 수 없습니다.").hasNoCause();
    }
}
