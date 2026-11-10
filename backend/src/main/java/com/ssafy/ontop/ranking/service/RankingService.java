package com.ssafy.ontop.ranking.service;

import com.ssafy.ontop.ranking.dto.RankingResponse;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.repository.RankingRepository;
import java.time.Instant;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class RankingService {
    private final ObjectProvider<RankingRepository> repositories;

    public RankingService(ObjectProvider<RankingRepository> repositories) {
        this.repositories = repositories;
    }

    public RankingResponse findRankings(long userId, int limit) {
        var repository = repositories.getIfAvailable();
        if (repository == null) {
            throw new RankingException(RankingException.Error.STORAGE);
        }
        try {
            var standings = repository.findStandings(userId, limit);
            var items = standings.stream().filter(row -> row.position() <= limit)
                    .map(row -> new RankingResponse.Item(row.rank(), Long.toString(row.userId()),
                            row.nickname(), row.coinBalance(), row.equipmentValue(), row.totalAssets())).toList();
            var mine = standings.stream().filter(row -> row.userId() == userId).findFirst()
                    .map(row -> new RankingResponse.MyRank(row.rank(), row.coinBalance(), row.equipmentValue(), row.totalAssets())).orElse(null);
            return new RankingResponse(items, mine, Instant.now());
        } catch (DataAccessException | TransactionException exception) {
            throw new RankingException(RankingException.Error.STORAGE);
        }
    }
}
