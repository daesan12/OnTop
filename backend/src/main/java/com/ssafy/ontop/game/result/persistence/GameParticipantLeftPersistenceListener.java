package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameParticipantLeft;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameParticipantLeftPersistenceListener {
    private final GameParticipantLeftPersistenceService departures;

    public GameParticipantLeftPersistenceListener(GameParticipantLeftPersistenceService departures) {
        this.departures = departures;
    }

    public void left(GameParticipantLeft event) {
        departures.accept(event);
    }
}
