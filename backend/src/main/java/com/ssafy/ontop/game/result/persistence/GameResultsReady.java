package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameResultView;
import java.util.List;

record GameResultsReady(List<GameResultView> results) {
    GameResultsReady { results = List.copyOf(results); }
}
