package com.ssafy.ontop.demo;

import com.ssafy.ontop.game.start.*;
import com.ssafy.ontop.game.result.*;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;

/** Local 0-coin human games only. Delegates the original alkkagi fixture unchanged. */
public final class AiParkLedger implements GameStartGateway,GameResultGateway {
    private final AlkkagiParkApplication.LocalLedger original; private final ApplicationEventPublisher events;
    private final Map<UUID,GameStartCommand> commands=new HashMap<>(); private final Map<UUID,GameStartResult> starts=new HashMap<>();
    private final Map<String,GameStartCommand> games=new ConcurrentHashMap<>();private final Map<String,GameResultView> results=new ConcurrentHashMap<>();
    public AiParkLedger(AlkkagiParkApplication.LocalLedger original,ApplicationEventPublisher events) {this.original=original;this.events=events;}
    @Override public synchronized GameStartResult startGame(GameStartCommand c) {
        if(!"OMOK".equals(c.gameCode()))return original.startGame(c);
        if(c.betAmountPerPlayer()!=0 || c.participants().size()!=2 || c.participants().stream().anyMatch(p -> !Set.of("101","202","505").contains(p.userId())))
            return GameStartResult.rejected(c.startAttemptId(),"LOCAL_OMOK_FREE_ONLY");
        var before=commands.putIfAbsent(c.startAttemptId(),c);
        if(before!=null&&!before.equals(c))return GameStartResult.conflict(c.startAttemptId());
        return starts.computeIfAbsent(c.startAttemptId(),id -> {String game="local-omok-"+UUID.randomUUID();games.put(game,c);return GameStartResult.reserved(c,game);});
    }
    @Override public synchronized GameStartResult findStartResult(UUID id) {return starts.containsKey(id)?starts.get(id):original.findStartResult(id);}
    @Override public Optional<GameResultView> load(long user,String game) {var r=results.get(game+":"+user);return r==null?original.load(user,game):Optional.of(r);}
    @EventListener public void finished(OmokGameFinished e) {
        var c=games.get(e.gameId());if(c==null)return;
        var participants=c.participants().stream().map(p -> new GameResultView.Participant(p.userId(),e.winnerUserId()==null?"DRAW":p.userId().equals(e.winnerUserId().toString())?"WIN":"LOSE")).toList();
        for(var p:c.participants()) {
            var r=new GameResultView(Long.parseLong(p.userId()),e.version(),e.gameId(),"OMOK",GameResultView.Status.FINISHED,e.endReason(),GameResultView.SettlementStatus.SETTLED,0,participants,0L,e.endedAt());
            if(results.putIfAbsent(e.gameId()+":"+p.userId(),r)==null)events.publishEvent(new GameResultCommitted(r));
        }
    }
}
