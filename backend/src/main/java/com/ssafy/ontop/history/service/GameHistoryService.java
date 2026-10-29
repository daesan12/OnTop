package com.ssafy.ontop.history.service;

import com.ssafy.ontop.history.dto.GameHistoryPageRequest;
import com.ssafy.ontop.history.dto.GameHistoryPageResponse;
import com.ssafy.ontop.history.dto.GameStatsResponse;
import com.ssafy.ontop.history.exception.GameHistoryException;
import com.ssafy.ontop.history.repository.GameHistoryRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class GameHistoryService {
    private final ObjectProvider<GameHistoryRepository> repositories;

    public GameHistoryService(ObjectProvider<GameHistoryRepository> repositories) {
        this.repositories = repositories;
    }

    public GameHistoryPageResponse findHistory(long userId, GameHistoryPageRequest request) {
        try {
            var rows = repository().findHistory(userId, request);
            boolean hasNext = rows.size() > request.size();
            var items = rows.subList(0, Math.min(rows.size(), request.size()));
            return new GameHistoryPageResponse(items, hasNext ? items.getLast().gameSessionId() : null, hasNext);
        } catch (DataAccessException | TransactionException exception) {
            throw new GameHistoryException(GameHistoryException.Error.STORAGE);
        }
    }

    public GameStatsResponse findStats(long userId) {
        try {
            return new GameStatsResponse(repository().findStats(userId));
        } catch (DataAccessException | TransactionException exception) {
            throw new GameHistoryException(GameHistoryException.Error.STORAGE);
        }
    }

    private GameHistoryRepository repository() {
        var repository = repositories.getIfAvailable();
        if (repository == null) {
            throw new GameHistoryException(GameHistoryException.Error.STORAGE);
        }
        return repository;
    }
}
