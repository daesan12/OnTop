package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.omok.domain.OmokBoard;
import com.ssafy.ontop.game.omok.domain.OmokMatch;
import com.ssafy.ontop.table.service.TableHub;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Explicit local-profile practice. No wallet, results repository or fake authenticated NPC account. */
public final class LocalCompanions implements AutoCloseable,AiFeature {
    @Override public String featureKey(){return "companions";}
    public enum Difficulty { EASY, NORMAL, HARD }
    static final long TABLE_APPROACH_MILLIS=1800;
    private record Waiting(TableHub.AiTable table,long since) { }
    private static final class Practice {
        final TableHub.AiTable table; final long npc; OmokMatch match; final Difficulty difficulty;final OmokResident resident;
        final long invitedAt;boolean arrived;
        final List<OmokBoard.Move> moves=new ArrayList<>();
        long rewriteGeneration;
        boolean thinking,rewriting;long spoken=-1; String speech="한 판 두어 보세. 참가비는 0엽전이고, 무르기와 무승부 제안은 받지 않네.";
        String speechSource="FIXED"; OmokAnalyzer.Analysis analysis=OmokAnalyzer.unavailable();
        Practice(TableHub.AiTable t,long npc,Difficulty d,Instant now,boolean immediate) {
            table=t;this.npc=npc;difficulty=d;resident=OmokResident.forDifficulty(d);invitedAt=now.toEpochMilli();arrived=immediate;speech=resident.opening(npc);
            match=new OmokMatch("npc-"+UUID.randomUUID(),t.tableId(),Long.parseLong(t.owner()),npc,now);
        }
        String actorId(){return "opponent-"+npc;}
    }
    private final TableHub hub; private final ObjectMapper mapper; private final Clock clock;
    private final OmokAnalyzer analyzer; private final AiText texts;
    private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon(true).name("local-companions").factory());
    private final ThreadPoolExecutor engine=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(64),Thread.ofPlatform().daemon(true).name("npc-omok-engine").factory());
    private final ThreadPoolExecutor dialogue=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(8),Thread.ofPlatform().daemon(true).name("npc-dialogue").factory());
    // Mutable maps and their entries share this monitor, including engine/dialogue callbacks.
    private final Map<String,Waiting> waiting=new HashMap<>(); private final Map<String,Practice> games=new HashMap<>();
    private final Map<String,Long> paused=new HashMap<>(),talkAfter=new HashMap<>();
    private final Map<String,String> conversations=new HashMap<>();
    private final Map<String,String> conversationSources=new HashMap<>();
    private final Map<String,NpcWander> walkers=new HashMap<>();
    private final NpcAmbient ambient=new NpcAmbient();
    private final Map<String,String> observers=new HashMap<>();
    private final Map<String,Long> observerSpoken=new HashMap<>();
    private final java.util.function.Supplier<com.ssafy.ontop.world.movement.ParkNavigation> navigationFactory;
    private com.ssafy.ontop.world.movement.ParkNavigation navigation;
    private volatile List<Map<String,Object>> actors=List.of();
    private long serial=8_000_000_000_000_000L; private boolean closed;private volatile String lastError="";
    private java.util.function.Supplier<List<com.ssafy.ontop.game.omok.service.OmokEngine.AnalysisPosition>> observed=List::of;
    private static final class Commentary {
        long rewriteGeneration;
        boolean playing;
        OmokResident voice=OmokResident.ELDER;
        final String gameId; TableHub.AiTable table;long version=-1,completed=-1,spoken=-1,lastAt;boolean pending,rewriting;
        OmokAnalyzer.Analysis analysis=OmokAnalyzer.unavailable();String speech="판세를 살펴보겠네.",source="FIXED";
        Commentary(String game,TableHub.AiTable table){gameId=game;this.table=table;}
    }
    private final Map<String,Commentary> commentary=new LinkedHashMap<>();
    private long actorVersion,actorServerAt;
    public synchronized void observe(java.util.function.Supplier<List<com.ssafy.ontop.game.omok.service.OmokEngine.AnalysisPosition>> source) { observed=source; }
    public LocalCompanions(TableHub hub,ObjectMapper mapper,Clock clock,OmokAnalyzer analyzer,AiText texts,
            java.util.function.Supplier<com.ssafy.ontop.world.movement.ParkNavigation> navigationFactory) {
        this.hub=hub;this.mapper=mapper;this.clock=clock;this.analyzer=analyzer;this.texts=texts;this.navigationFactory=navigationFactory;
    }
    public void start() { timer.scheduleWithFixedDelay(() -> { try { tick();lastError=""; } catch(RuntimeException failure) { lastError="COMPANION_"+failure.getClass().getSimpleName(); } },100,100,TimeUnit.MILLISECONDS); }
    public synchronized void tick() {
        if(closed) return;
        long now=clock.millis();
        for(var g:List.copyOf(games.values())) {
            if(!hub.aiPracticeValid(g.table.tableId(),g.table.owner(),Long.toString(g.npc))) { release(g); continue; }
            if(!g.arrived){
                if(now-g.invitedAt<TABLE_APPROACH_MILLIS)continue;
                g.arrived=true;
                // The local entrance animation never consumes the player's turn time.
                g.match=new OmokMatch(g.match.snapshot().gameId(),g.table.tableId(),Long.parseLong(g.table.owner()),g.npc,clock.instant());
            }
            boolean wasPlaying=g.match.snapshot().endedAt()==null;
            g.match.expire(clock.instant());
            if(wasPlaying && g.match.snapshot().endedAt()!=null) {
                g.rewriting=false;g.rewriteGeneration++;
                g.speech=g.resident.timeout();g.speechSource="FIXED_TIMEOUT";
            }
            if(g.match.snapshot().endedAt()!=null && g.thinking) g.thinking=false;
            if(g.match.snapshot().endedAt()!=null && now-g.match.snapshot().endedAt().toEpochMilli()>30_000) {
                release(g);pauseAuto(g.table.tableId());
            }
        }
        var eligible=hub.aiWaitingOmok(); var ids=eligible.stream().map(TableHub.AiTable::tableId).toList();
        waiting.keySet().retainAll(ids);
        paused.keySet().retainAll(ids);
        for(var table:eligible) {
            if(paused.containsKey(table.tableId()) && paused.get(table.tableId())!=table.version())paused.remove(table.tableId());
            var before=waiting.get(table.tableId());
            if(before==null || !before.table().owner().equals(table.owner()) || before.table().version()!=table.version())
                waiting.put(table.tableId(),new Waiting(table,now));
            if(now-waiting.get(table.tableId()).since()>=30_000 && !paused.containsKey(table.tableId())) {
                try { invite(table.owner(),Difficulty.NORMAL); }
                catch(IllegalArgumentException changed) {
                    // A fresh seat snapshot is still required; do not retry a failed reservation every 100ms.
                    waiting.put(table.tableId(),new Waiting(table,now));
                }
            }
        }
        observeGames(now);
        updateActors(now);
    }
    public synchronized Map<String,Object> invite(String owner,Difficulty difficulty) {
        checkOpen();
        var existing=games.values().stream().filter(g -> g.table.owner().equals(owner)).findFirst();
        if(existing.isPresent()) return view(existing.get());
        var table=hub.aiWaitingOmok().stream().filter(t -> t.owner().equals(owner)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("오목을 선택한 테이블에 혼자 앉아 있을 때 부를 수 있어요."));
        long npc=++serial;
        if(!hub.aiReserveOmok(table,Long.toString(npc))) throw new IllegalArgumentException("좌석이 바뀌었어요. 다시 확인해주세요.");
        var g=new Practice(table,npc,difficulty,clock.instant(),navigationFactory==null);hub.aiBindPracticeGame(table.tableId(),Long.toString(npc),g.match.snapshot().gameId());games.put(table.tableId(),g);waiting.remove(table.tableId());paused.remove(table.tableId());
        return view(g);
    }
    public synchronized Map<String,Object> action(String owner,JsonNode body) {
        checkOpen();
        var g=own(owner); var s=g.match.snapshot();
        if(!s.gameId().equals(body.path("gameId").asText())) throw new IllegalArgumentException("대결이 바뀌었어요. 현재 대결을 확인해주세요.");
        String kind=body.path("kind").asText();
        if("stop".equals(kind)) { release(g);pauseAuto(g.table.tableId());return Map.of("stopped",true); }
        if(!hub.aiPracticeValid(g.table.tableId(),owner,Long.toString(g.npc))) throw new IllegalArgumentException("현재 좌석을 확인해주세요.");
        if(!g.arrived)throw new IllegalArgumentException("주민이 걸어오고 있어요. 자리에 앉으면 대결을 시작해요.");
        if("undoRequest".equals(kind)||"drawRequest".equals(kind)) {
            g.speech=g.resident.policy();g.speechSource="FIXED_POLICY";
            return Map.of("rejected",true,"message",g.speech);
        }
        if(!body.path("version").isIntegralNumber() || body.path("version").asLong()!=s.version()) throw new IllegalArgumentException("최신 판을 확인해주세요.");
        if("forfeit".equals(kind)) { g.match.forfeit(Long.parseLong(owner),clock.instant(),"SURRENDER");g.rewriting=false;g.rewriteGeneration++;g.speech=g.resident.goodbye();g.speechSource="FIXED_SURRENDER";return view(g); }
        if(!"place".equals(kind)||g.thinking || !body.path("x").isIntegralNumber()||!body.path("y").isIntegralNumber()) throw new IllegalArgumentException("착수 입력을 확인해주세요.");
        int x=body.path("x").asInt(),y=body.path("y").asInt();
        var input=mapper.createObjectNode().put("x",x).put("y",y);
        String action=body.path("actionId").asText();
        g.match.apply(new GameActionCommand(Long.parseLong(owner),s.gameId(),action,s.version(),input),clock.instant());
        g.rewriting=false;g.rewriteGeneration++;
        g.moves.add(new OmokBoard.Move(x,y,OmokBoard.Stone.BLACK));
        if(g.match.snapshot().endedAt()==null) queueBot(g); else g.speech=finishedSpeech(g);
        return view(g);
    }
    private void queueBot(Practice g) {
        var before=g.match.snapshot(); var history=List.copyOf(g.moves);g.thinking=true;
        try { engine.execute(() -> { try {
            OmokAnalyzer.Analysis a;
            try { a=g.difficulty==Difficulty.EASY?OmokAnalyzer.unavailable():analyzer.analyze(before.board(),history); }
            catch(RuntimeException failure) { a=OmokAnalyzer.unavailable(); }
            int[] move=OmokNpcMoves.choose(before.board(),history,g.difficulty==Difficulty.NORMAL&&history.size()%6==5?"":a.bestMove(),g.difficulty.name());
            synchronized(this) {
                if(closed || games.get(g.table.tableId())!=g || !hub.aiPracticeValid(g.table.tableId(),g.table.owner(),Long.toString(g.npc))) { g.thinking=false;return; }
                g.match.expire(clock.instant()); var current=g.match.snapshot();
                if(current.endedAt()!=null || current.version()!=before.version()) { g.thinking=false;return; }
                g.match.apply(new GameActionCommand(g.npc,current.gameId(),"npc-"+current.version(),current.version(),mapper.createObjectNode().put("x",move[0]).put("y",move[1])),clock.instant());
                g.moves.add(new OmokBoard.Move(move[0],move[1],OmokBoard.Stone.WHITE));g.thinking=false;g.analysis=a;
                g.speech=g.match.snapshot().endedAt()!=null?finishedSpeech(g):g.resident.response(g.moves.size()/2,a);g.speechSource=a.source();
                // Engine evaluation was BEFORE the NPC move; label it explicitly, never as the new board's score.
                if(g.match.snapshot().endedAt()==null) rewrite(g,g.match.snapshot().version(),"직전 국면 평가: "+a.comment());
            }
        } catch(RuntimeException failure) { synchronized(this) { if(games.get(g.table.tableId())==g) {
            g.thinking=false;g.match.forfeit(g.npc,clock.instant(),"NPC_ENGINE_FAILURE");g.speech="엔진 응답을 마치지 못했네. 이번 연습은 끝내고 다시 불러 주게. 엽전 변동은 없네.";
        } } } }); } catch(RejectedExecutionException full) { g.thinking=false;g.match.forfeit(g.npc,clock.instant(),"NPC_ENGINE_BUSY");g.speech="잠시 생각을 정리 중이네. 다시 대결을 불러 주게."; }
    }
    private void rewrite(Practice g,long version,String facts) {
        // Most lines remain fixed. At most one generated commentary every six stones.
        if(g.moves.size()%6!=0 || texts.mode().equals("FIXED")) return;
        g.rewriting=true;long generation=++g.rewriteGeneration;
        String fallback=g.speech;
        try { dialogue.execute(() -> {
            try {
                var reply=reply(g.resident.prompt,facts+"\n판돈 0. 추천 좌표와 승률 숫자는 말하지 말 것.",fallback);
                synchronized(this) { if(games.get(g.table.tableId())==g && g.match.snapshot().version()==version && g.rewriteGeneration==generation) { g.speech=reply.text();g.speechSource=reply.source(); } }
            } finally { synchronized(this) { if(g.rewriteGeneration==generation)g.rewriting=false; } }
        }); } catch(RejectedExecutionException ignored) {g.rewriting=false;}
    }
    public synchronized Map<String,Object> status(String owner,String channel) {
        checkOpen();var result=new LinkedHashMap<String,Object>();
        result.put("actors",actors.stream().filter(a -> a.get("channelId").equals(channel)).toList());
        result.put("actorVersion",actorVersion);result.put("serverNow",actorServerAt);
        result.put("mode",texts.mode());result.put("engine",analyzer instanceof RapfiAnalyzer?"RAPFI":"LOCAL_TACTICAL");
        result.put("llmUsage",texts.usage());result.put("error",lastError);
        var game=games.values().stream().filter(g -> g.table.owner().equals(owner)).findFirst();
        result.put("practice",game.map(this::view).orElse(null));
        String chatScope=hub.aiPracticeChatGame(owner);
        var chatGame=games.values().stream().filter(g->g.match.snapshot().gameId().equals(chatScope)).findFirst();
        result.put("practiceChat",chatGame.map(g->Map.of("gameId",chatScope,"version",g.match.snapshot().version(),"role",g.table.owner().equals(owner)?"PLAYER":"SPECTATOR")).orElse(null));
        result.put("observedPractice",chatGame.filter(g->!g.table.owner().equals(owner)).map(this::view).orElse(null));
        var wait=waiting.values().stream().filter(w -> w.table().owner().equals(owner)).findFirst();
        result.put("waitSeconds",wait.map(w -> Math.max(0,30-(clock.millis()-w.since())/1000)).orElse(-1L));
        result.put("autoPaused",wait.map(w -> paused.containsKey(w.table().tableId())).orElse(false));
        result.put("reply",conversations.getOrDefault(owner,""));
        result.put("replySource",conversationSources.getOrDefault(owner,""));
        result.put("commentary",commentary.values().stream().filter(c -> c.table.channelId().equals(channel) && c.completed==c.version)
                .map(c -> Map.of("gameId",c.gameId,"tableId",c.table.tableId(),"version",c.completed,"name",c.voice.name,"speech",c.speech,"source",c.analysis.source(),"speechSource",c.source,
                        "advantage",c.analysis.advantage(),"evaluation",c.analysis.blackEstimate()==null?"미정":Math.round(c.analysis.blackEstimate()*100)+"% (엔진 지표 · 실제 승률 아님)"))
                .toList());return result;
    }
    public synchronized Map<String,Object> talk(String owner,String persona,String question) {
        checkOpen();
        if(persona==null || !List.of("guide","omok").contains(persona) || question==null || question.isBlank() || question.length()>300) throw new IllegalArgumentException("질문은 1~300자로 입력해주세요.");
        long now=clock.millis();if(now<talkAfter.getOrDefault(owner,0L)) throw new IllegalArgumentException("답변을 기다린 뒤 다시 이야기해주세요.");
        talkAfter.put(owner,now+10_000);conversations.put(owner,"답변을 생각하고 있어요.");conversationSources.put(owner,"PENDING");
        String fallback=persona.equals("omok")?"오목은 15×15 렌주일세. 흑의 삼삼·사사·장목은 금수이고, NPC전은 0엽전일세.":"어서 오게. 테이블에서 게임을 고르거나 소리함에 의견을 남겨 보게나.";
        String facts=parkFacts(owner),q=question.replaceAll("\\s+","");
        String fixed=q.matches(".*(안녕|반가).*" )?"허허, 어서 오게. 공원을 산책하거나 오목 한 판 두고 가게나.":
                q.matches(".*(무르기|무승부|기권).*" )?"NPC전에서는 무르기와 무승부 제안은 받지 않네. 기권하거나 끝까지 두어 주게.":
                q.matches(".*(판돈|참가비|엽전).*" )?"나와 두는 NPC 연습은 0엽전이고, 실제 엽전 변동은 없네.":
                q.matches(".*(규칙|금수|렌주).*" )?"15×15 렌주일세. 흑은 삼삼·사사·장목이 금수이고, 한 수 제한은 30초라네.":
                q.matches(".*(소리함|제보|신고).*" )?"소리함 가까이 가서 의견을 남겨 주게. 긴급 제보와 일반 의견은 운영 알림 정책에 따라 전달된다네.":
                q.matches(".*(심심|추천|뭐해|뭐하).*" )?facts+" 혼자 오목을 선택하면 30초 후 윤한수을 부른다네. 주민과 두기에서 세 난이도 상대를 골라 0엽전으로 연습해도 좋네.":null;
        if(fixed!=null) {conversations.put(owner,fixed);conversationSources.put(owner,"FIXED_FAQ");}
        else try { dialogue.execute(() -> {
            var reply=reply(persona.equals("guide")?"박영감. 친절한 공원 안내자":"박영감. 차분한 오목 고수","확정 사실: NPC전은 0엽전, 15×15 렌주, 무르기·무승부 제안 거절. 소리함에 의견 접수 가능. 서버 조회: "+facts+" 질문: "+question,fallback);
            synchronized(this) { if(!closed && talkAfter.getOrDefault(owner,0L)==now+10_000) {conversations.put(owner,reply.text());conversationSources.put(owner,reply.source());} }
        }); } catch(RejectedExecutionException full) { conversations.put(owner,fallback);conversationSources.put(owner,"FIXED_BUSY"); }
        return Map.of("accepted",true);
    }
    private String parkFacts(String owner) {
        String channel=hub.aiActors().entrySet().stream().filter(e -> e.getValue().containsKey(owner)).map(Map.Entry::getKey).findFirst().orElse(null);
        if(channel==null)return "현재 공원 연결 정보를 확인하지 못했네. 진행 경기나 판세를 추측하지 말게.";
        long available=hub.aiWaitingOmok().stream().filter(t -> t.channelId().equals(channel)).count();
        String result="현재 이 공원에서 혼자 기다리는 오목 테이블은 "+available+"개일세.";
        var own=games.values().stream().filter(g -> g.table.owner().equals(owner)).findFirst();
        if(own.isPresent()) {
            var g=own.get();var s=g.match.snapshot();
            result+=" 현재 연습은 "+s.board().moveCount()+"수, "+(s.endedAt()==null?"진행 중":"종료")+"일세. 직전 NPC 착수 전 평가: "+g.analysis.comment()+" 실제 승률은 아니네.";
        } else {
            var current=commentary.values().stream().filter(c -> c.table.channelId().equals(channel)&&c.completed==c.version).limit(2).toList();
            if(current.isEmpty())result+=" 현재 확인된 경기 판세는 없네.";
            else for(var c:current)result+=" 관전 국면 v"+c.completed+": "+c.analysis.comment()+" ("+c.analysis.source()+", 실제 승률 아님).";
        }
        return result;
    }
    private Practice own(String owner) { return games.values().stream().filter(g -> g.table.owner().equals(owner)).findFirst().orElseThrow(() -> new IllegalArgumentException("진행 중인 NPC 대결이 없어요.")); }
    private Map<String,Object> view(Practice g) {
        var r=new LinkedHashMap<String,Object>();r.put("snapshot",g.match.snapshot());r.put("npcUserId",Long.toString(g.npc));r.put("name",g.resident.name);r.put("difficulty",g.difficulty);
        r.put("actorId",g.actorId());r.put("phase",g.arrived?"PLAYING":"ARRIVING");
        r.put("lastMove",g.moves.isEmpty()?null:g.moves.get(g.moves.size()-1));
        r.put("bet",0);r.put("thinking",g.thinking);r.put("speechPending",g.rewriting);r.put("speech",g.speech);r.put("speechSource",g.speechSource);r.put("analysis",g.analysis);r.put("analysisNote","직전 NPC 착수 전 국면 · 엔진 평가 지표이며 실제 승률 아님");return r;
    }
    private void release(Practice g) { games.remove(g.table.tableId());hub.aiReleaseOmok(g.table.tableId(),Long.toString(g.npc)); }
    private String finishedSpeech(Practice g){var s=g.match.snapshot();return g.resident.result(Objects.equals(s.winnerUserId(),s.blackUserId()),s.winnerUserId()==null);}
    private void pauseAuto(String table) { paused.put(table,hub.aiWaitingOmok().stream().filter(t -> t.tableId().equals(table)).map(TableHub.AiTable::version).findFirst().orElse(-1L)); }
    private void checkOpen() { if(closed) throw new IllegalStateException("종료된 로컬 검수입니다."); }
    private void observeGames(long now) {
        var positions=observed.get();var ids=positions.stream().map(p -> p.snapshot().gameId()).collect(java.util.stream.Collectors.toSet());
        commentary.keySet().retainAll(ids);
        for(var position:positions) {
            var s=position.snapshot();var table=hub.aiOmokLocation(s.tableId());if(table==null)continue;
            var c=commentary.computeIfAbsent(s.gameId(),id -> new Commentary(id,table));c.table=table;c.playing=s.endedAt()==null;if(c.version!=s.version()){c.rewriting=false;c.rewriteGeneration++;}c.version=s.version();
            if(c.pending || c.completed==s.version() || now-c.lastAt<5000)continue;
            if(engine.getActiveCount()>0 || !engine.getQueue().isEmpty() || games.values().stream().anyMatch(g -> g.thinking))continue;
            c.pending=true;c.lastAt=now;
            try { engine.execute(() -> {
                OmokAnalyzer.Analysis a;
                try { a=s.endedAt()!=null?OmokAnalyzer.finished(s.board().outcome()):analyzer.analyze(s.board(),position.moves()); }
                catch(RuntimeException failure){a=OmokAnalyzer.unavailable();}
                synchronized(this) {
                    if(closed || commentary.get(s.gameId())!=c)return;c.pending=false;
                    if(c.version!=s.version())return;
                    c.analysis=a;c.completed=s.version();c.voice=OmokResident.ELDER;c.speech=c.voice.observation(s.version(),a);c.source=a.source();
                    if(s.endedAt()!=null)c.speech=s.winnerUserId()==null?"무승부로 끝났구먼. 두 사람 모두 수고했네!":(s.winnerUserId()==s.blackUserId()?"흑":"백")+"을 든 친구가 이겼구먼. 두 사람 모두 수고했네!";
                    if(s.board().moveCount()>0 && s.board().moveCount()%6==0) rewriteCommentary(c,s.version());
                }
            }); } catch(RejectedExecutionException full){c.pending=false;}
        }
    }
    private void rewriteCommentary(Commentary c,long version) {
        if(texts.mode().equals("FIXED"))return;
        c.rewriting=true;long generation=++c.rewriteGeneration;
        var voices=Arrays.stream(OmokResident.values()).filter(r->c.gameId.equals(observers.get(r.id(c.table.channelId())))).toList();
        c.voice=voices.isEmpty()?OmokResident.ELDER:voices.get((int)((version/6)%voices.size()));c.speech=c.voice.observation(version,c.analysis);var voice=c.voice;
        String fallback=c.speech;
        try { dialogue.execute(() -> {
            try {
                var reply=reply(voice.prompt+" 양쪽을 응원하는 중립 오목 해설자.","제공 사실: "+fallback+" 좌표나 새 수치를 만들지 말고 짧게 해설할 것.",fallback);
                synchronized(this){if(commentary.get(c.gameId)==c && c.version==version && c.rewriteGeneration==generation){c.speech=reply.text();c.source=reply.source();}}
            } finally {synchronized(this){if(c.rewriteGeneration==generation)c.rewriting=false;}}
        }); } catch(RejectedExecutionException ignored){c.rewriting=false;}
    }
    private record Watch(String id,String gameScope,TableHub.AiTable table,long version,OmokAnalyzer.Analysis analysis,String speech,OmokResident voice,boolean ready) { }
    private Map<String,Watch> watchTargets(String channel) {
        var targets=new LinkedHashMap<String,Watch>();
        for(var c:commentary.values())if(c.playing&&c.table.channelId().equals(channel))targets.put(c.gameId,new Watch(c.gameId,c.gameId,c.table,c.version,c.analysis,c.speech,c.voice,c.completed==c.version&&!c.rewriting));
        for(var g:games.values())if(g.arrived&&g.table.channelId().equals(channel)&&g.match.snapshot().endedAt()==null){var state=g.match.snapshot();targets.put(state.gameId(),new Watch(state.gameId(),state.gameId(),g.table,state.version(),OmokAnalyzer.unavailable(),g.speech,g.resident,!g.thinking&&!g.rewriting));}
        return targets;
    }
    private NpcWander walker(String id,OmokResident resident) {
        return walkers.computeIfAbsent(id,key->new NpcWander(navigation.spawn(navigation.plazaTables()),new NpcWander.Navigation() {
            public List<com.ssafy.ontop.world.movement.ParkNavigation.Point> path(com.ssafy.ontop.world.movement.ParkNavigation.Point a,com.ssafy.ontop.world.movement.ParkNavigation.Point b){
                var area=navigation.plazaTables();return navigation.path(a,b,area.contains(a)&&area.contains(b)?area:null);
            }
            public com.ssafy.ontop.world.movement.ParkNavigation.Point destination(com.ssafy.ontop.world.movement.ParkNavigation.Point from,java.util.random.RandomGenerator random){return navigation.randomDestination(from,navigation.plazaTables(),random);}
        },new Random(),resident==OmokResident.ELDER?1.35:1.6));
    }
    private void updateActors(long now) {
        if(navigationFactory==null)return;
        var worlds=hub.aiActors();
        if(worlds.isEmpty()&&navigation==null)return;
        if(navigation==null)navigation=navigationFactory.get();
        var live=new HashSet<String>();for(String channel:worlds.keySet())for(var resident:OmokResident.values())live.add(resident.id(channel));
        walkers.keySet().retainAll(live);
        ambient.retain(live);
        double dt=actorServerAt==0?.1:Math.max(0,Math.min(.2,(now-actorServerAt)/1000.0));
        var connected=worlds.values().stream().flatMap(a->a.keySet().stream()).collect(java.util.stream.Collectors.toSet());
        conversations.keySet().retainAll(connected);conversationSources.keySet().retainAll(connected);talkAfter.keySet().retainAll(connected);
        var previous=Map.copyOf(observers);observers.clear();var speechKeys=new HashSet<String>();var result=new ArrayList<Map<String,Object>>();
        for(var entry:worlds.entrySet()) {
            String channel=entry.getKey();var targets=watchTargets(channel);
            var available=Arrays.stream(OmokResident.values()).map(r->r.id(channel)).toList();
            observers.putAll(OmokCrowd.assign(previous,available,List.copyOf(targets.keySet())));
            for(var resident:OmokResident.values()) {
                String id=resident.id(channel);var walker=walker(id,resident);
                var watch=targets.get(observers.get(id));
                // The three roaming residents only watch; table opponents have independent bodies below.
                var focus=watch==null?null:navigation.groundPoint(watch.table().x()+2,watch.table().z()+(resident.ordinal()-1)*2);
                var v=walker.tick(now,dt,focus);
                double x=v.point().x(),y=v.point().y()-.8,z=v.point().z(),yaw=v.yaw();boolean moving=v.moving(),seated=false;
                var decision=v.decision();String action=decision.action(),tableId="";
                if(watch!=null){tableId=watch.table().tableId();if(!moving)yaw=Math.atan2(watch.table().x()-x,watch.table().z()-z);}
                var actor=new LinkedHashMap<String,Object>();actor.put("id",id);actor.put("channelId",channel);actor.put("name",resident.name);actor.put("role",resident==OmokResident.ELDER?"GUIDE":"VISITOR");actor.put("persona",resident.name());actor.put("difficulty",resident.difficulty);
                actor.put("x",x);actor.put("y",y);actor.put("z",z);actor.put("yaw",yaw);actor.put("moving",moving);actor.put("seated",seated);actor.put("action",action);actor.put("utilities",decision.scores());actor.put("tableId",tableId);actor.put("observingGameId",watch==null?"":watch.id());result.add(actor);
                actor.put("ambient",ambient.tick(id,resident.name(),watch==null&&(action.equals("PATROL")||action.equals("REST")),now));
                final double sx=x,sz=z;
                var audience=entry.getValue().entrySet().stream().filter(p->Math.hypot(p.getValue().x()-sx,p.getValue().z()-sz)<=20).map(Map.Entry::getKey).toList();
                if(watch!=null) {
                    String key=id+"|"+watch.id();speechKeys.add(key);
                    if(watch.ready()&&observerSpoken.getOrDefault(key,-1L)!=watch.version()&&Math.hypot(watch.table().x()-x,watch.table().z()-z)<5&&!moving){
                        String speech=watch.voice()==resident?watch.speech():resident.observation(watch.version(),watch.analysis());
                        speak(channel,watch.gameScope(),watch.id(),watch.version(),speech,x,y,z,audience,resident);observerSpoken.put(key,watch.version());
                    }
                }
            }
            for(var g:games.values())if(g.table.channelId().equals(channel)&&g.match.snapshot().endedAt()==null){
                // Cosmetic entrance along the table edge: no global navigation route or shared body lease.
                double progress=g.arrived?1:Math.max(0,Math.min(1,(now-g.invitedAt)/(double)TABLE_APPROACH_MILLIS));
                double x=g.table.x()+2.4*(1-progress),y=g.table.y()-.8,z=g.table.z()+(g.table.ownerSeat()==1?-1.25:1.25);
                var actor=new LinkedHashMap<String,Object>();actor.put("id",g.actorId());actor.put("channelId",channel);actor.put("name",g.resident.name);
                actor.put("role","OPPONENT");actor.put("persona",g.resident.name());actor.put("difficulty",g.difficulty.name());actor.put("tableId",g.table.tableId());
                actor.put("x",x);actor.put("y",y);actor.put("z",z);actor.put("yaw",g.arrived?(g.table.ownerSeat()==1?0:Math.PI):-Math.PI/2);
                actor.put("moving",!g.arrived);actor.put("seated",g.arrived);actor.put("action",g.arrived?"PLAY_OMOK":"APPROACH_OMOK");result.add(actor);
                var state=g.match.snapshot();
                if(g.arrived&&!g.thinking&&!g.rewriting&&g.spoken!=state.version()){
                    var audience=entry.getValue().entrySet().stream().filter(p->Math.hypot(p.getValue().x()-x,p.getValue().z()-z)<=20).map(Map.Entry::getKey).toList();
                    speak(channel,state.gameId(),state.gameId(),state.version(),g.speech,x,y,z,audience,g.resident,g.actorId());g.spoken=state.version();
                }
            }
        }
        observerSpoken.keySet().retainAll(speechKeys);actors=List.copyOf(result);actorVersion++;actorServerAt=now;
        for(var world:worlds.entrySet())hub.publishAi(world.getKey(),List.copyOf(world.getValue().keySet()),"WORLD_AI_COMPANIONS",Map.of("channelId",world.getKey(),"version",actorVersion,"serverNow",now,"actors",actors.stream().filter(a->a.get("channelId").equals(world.getKey())).toList()));
    }
    private AiText.Reply reply(String persona,String facts,String fallback) {
        try {var r=texts.generate(persona,facts,fallback);if(r==null||r.text()==null||r.text().isBlank()||r.text().length()>600)throw new IllegalArgumentException("응답 길이 오류");return r;}
        catch(RuntimeException unavailable){return new AiText.Reply(fallback,"FIXED_PROVIDER_FAILURE");}
    }
    private void speak(String channel,String game,String event,long version,String text,double x,double y,double z,List<String> audience,OmokResident resident) {
        speak(channel,game,event,version,text,x,y,z,audience,resident,resident.id(channel));
    }
    private void speak(String channel,String game,String event,long version,String text,double x,double y,double z,List<String> audience,OmokResident resident,String actor) {
        String speech=text.length()>400?text.substring(0,400):text;
        hub.publishAi(channel,audience,"WORLD_AI_COMPANION_SPEECH",Map.ofEntries(
                Map.entry("channelId",channel),Map.entry("gameId",game),Map.entry("incidentId",actor+":"+event+":"+version),
                Map.entry("name",resident.name),Map.entry("actorId",actor),Map.entry("speech",speech),Map.entry("x",x),Map.entry("y",y),Map.entry("z",z),Map.entry("expiresAt",clock.millis()+30_000),Map.entry("basedOnVersion",version)),game);
    }
    @Override public synchronized void close() { closed=true;timer.shutdownNow();engine.shutdownNow();dialogue.shutdownNow();for(var g:List.copyOf(games.values()))release(g);if(navigation!=null)navigation.close(); }
}
