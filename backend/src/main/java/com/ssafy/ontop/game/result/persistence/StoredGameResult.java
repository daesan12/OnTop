package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.result.GameResultView;
import java.util.List;

final class StoredGameResult {
    private StoredGameResult() { }

    static GameResultView forMember(GameSession game, List<GameParticipant> players, GameParticipant me) {
        return new GameResultView(me.userId(), game.resultVersion(), Long.toString(game.id()), game.gameCode(),
                GameResultView.Status.valueOf(game.status().name()), game.endReason(),
                GameResultView.SettlementStatus.valueOf(game.settlementStatus().name()), game.betAmountPerPlayer(),
                players.stream().map(p -> new GameResultView.Participant(Long.toString(p.userId()),
                        p.result() == null ? null : p.result().name())).toList(),
                game.settlementStatus() == GameSession.SettlementStatus.SETTLED ? me.coinDelta() : null, game.endedAt());
    }
}
