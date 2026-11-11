package com.ssafy.ontop.ailab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.*;
import com.ssafy.ontop.game.omok.domain.OmokBoard;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Trusted local fixtures only. No member impersonation, public DB, production registration, or hidden live calls. */
public final class AiLabRuntime implements AutoCloseable {
    private final LocalAiStore store;
    private final LocalParkVisitors visitors=new LocalParkVisitors();
    private final NpcDirector npcs;
    private final AiOperations operations;
    private final AiText texts;
    private final AiDecisions decisions;
    private final OmokAnalyzer analyzer;
    private final boolean live;
    private final boolean liveJev;
    private final boolean liveMm;
    private final ScheduledExecutorService tick=Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon(true).name("ai-lab-tick").factory());
    private final ThreadPoolExecutor workers=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(16),
            Thread.ofPlatform().daemon(true).name("ai-lab-worker-",0).factory(),new ThreadPoolExecutor.AbortPolicy());
    private final AtomicReference<BoardRequest> analysisRequest=new AtomicReference<>();
    private final AtomicBoolean analyzing=new AtomicBoolean();
    private OmokBoard board=new OmokBoard();
    private List<OmokBoard.Move> moves=new ArrayList<>();
    private String gameId=UUID.randomUUID().toString();
    private long gameVersion;
    private boolean gameActive;
    private long gameEndAt;
    private long commentedVersion=-1;
    private OmokAnalyzer.Analysis analysis=OmokAnalyzer.unavailable();
    private boolean closed;

    public AiLabRuntime(ObjectMapper mapper,Path directory,Map<String,String> env) throws java.io.IOException {
        String personas=env.getOrDefault("AI_LAB_PERSONAS_FILE","");
        npcs=personas.isBlank()?new NpcDirector():new NpcDirector(mapper.readerForListOf(NpcDirector.Persona.class).readValue(Path.of(personas).toFile()));
        live="true".equals(env.get("AI_LAB_LIVE"));
        liveJev=live || "true".equals(env.get("AI_LAB_JEV_LIVE"));
        liveMm="true".equals(env.get("AI_LAB_MM_LIVE"));
        decisions=liveJev?new JevDecisions(mapper,required(env,"JEV_API_KEY"),env.getOrDefault("JEV_MODEL","jev-1.14.0"),
                () -> moderationGuidance(directory.resolve("moderation-guidance.txt"))):new OfflineDecisions();
        texts=live?new SpringAiText(required(env,"OPENAI_API_KEY"),required(env,"AI_LAB_LLM_MODEL"),
                Integer.parseInt(env.getOrDefault("AI_LAB_LLM_DAILY_CALLS","300"))):AiText.fixed();
        AiNotifier notifier=liveMm?new MattermostNotifier(required(env,"AI_LAB_MM_WEBHOOK"),mapper):AiNotifier.local();
        String rapfi=env.getOrDefault("AI_LAB_RAPFI_PATH","");
        analyzer=rapfi.isBlank()?(snapshot,history) -> snapshot.outcome()!=OmokBoard.Outcome.PLAYING
                ?OmokAnalyzer.finished(snapshot.outcome()):OmokAnalyzer.unavailable():new RapfiAnalyzer(Path.of(rapfi),300);
        int cooldownSeconds=Integer.parseInt(env.getOrDefault("AI_LAB_INCIDENT_COOLDOWN_SECONDS","60"));
        if(cooldownSeconds<1 || cooldownSeconds>300) throw new IllegalArgumentException("사건 쿨다운은1~300초여야 합니다.");
        store=new LocalAiStore(directory,mapper);
        operations=new AiOperations(store,decisions,texts,notifier,Clock.systemUTC(),
                c -> npcs.incident(c.incidentId(),c.x(),c.z(),c.speech(),System.currentTimeMillis()),
                cooldownSeconds*1_000L,true);
        tick.scheduleWithFixedDelay(() -> {
            try {
                long now=System.currentTimeMillis();
                synchronized(this) {
                    if(gameEndAt>0 && now>=gameEndAt) { gameActive=false; gameEndAt=0; npcs.omok(false); }
                    boolean terminal=board.snapshot().outcome()!=OmokBoard.Outcome.PLAYING;
                    if(gameActive && commentedVersion!=gameVersion && !analysis.source().equals("UNAVAILABLE")
                            && npcs.comment(analysis.comment(),analysis.source(),now,terminal)) {
                        commentedVersion=gameVersion;
                        if(terminal) gameEndAt=now+12_000;
                    }
                }
                npcs.tick(now,.25);
                visitors.tick(.25);
            }
            catch(RuntimeException ignored) { /* Independent from the operations worker. */ }
        },0,250,TimeUnit.MILLISECONDS);
        tick.scheduleWithFixedDelay(() -> submitQuietly(operations::tick),1000,1000,TimeUnit.MILLISECONDS);
    }
    public Object command(JsonNode body) {
        if(!body.isObject()) throw new IllegalArgumentException("JSON 객체가 필요합니다.");
        return switch(text(body,"action",32)) {
            case "chat" -> {
                String author=text(body,"author",32),scope=scope(body.path("scope").asText());
                var position=visitors.position(author,scope);
                yield Map.of("messageId",operations.chat(author,scope,text(body,"text",400),position.x(),position.z(),visitors.audience(author,scope)));
            }
            case "walk" -> {
                if(!body.path("x").isNumber() || !body.path("z").isNumber()) throw new IllegalArgumentException("이동 좌표 필요");
                yield visitors.walk(text(body,"author",32),scope(body.path("scope").asText()),body.path("x").doubleValue(),body.path("z").doubleValue());
            }
            case "stopWalk" -> visitors.stop(text(body,"author",32),scope(body.path("scope").asText()));
            case "feedback" -> operations.feedback(text(body,"author",32),text(body,"operationId",64),text(body,"text",600));
            case "flush" -> { submit(operations::flush); yield Map.of("queued",true); }
            case "digest" -> { submit(operations::digest); yield Map.of("queued",true); }
            case "retry" -> { operations.retryNotices(); submit(operations::flush); yield Map.of("queued",true); }
            case "restore" -> { operations.restore(text(body,"messageId",64)); yield Map.of("restored",true); }
            case "failures" -> { operations.failures(body.path("decisions").asBoolean(),body.path("notifier").asBoolean()); yield operations.status(); }
            case "talk" -> {
                String id=text(body,"npcId",32),question=text(body,"text",400);
                long generation=npcs.beginTalk(id,System.currentTimeMillis());
                try { submit(() -> {
                    String fallback=question.contains("오목")?"오목은 흑백이 번갈아 두고 다섯 돌을 잇는 놀이일세. 흑은 금수를 조심하게."
                            :question.contains("추천")?"지금 로컬 오목판이 준비돼 있네. 한 판 두어보겠나?":npcs.greeting(id);
                    AiText.Reply reply;
                    if(question.matches(".*(안녕|반가|고마워|규칙|오목|추천).*")) reply=new AiText.Reply(fallback,"FIXED");
                    else {
                        AiDecisions.NpcIntent intent;
                        try { intent=decisions.npcIntent(question); }
                        catch(RuntimeException failure) { intent=AiDecisions.NpcIntent.CHAT; }
                        reply=texts.generate(npcs.persona(id),"의도: "+intent+"\n질문: "+question
                                +"\n사실: 로컬 검수용 공원. 오목판 1개. 실제 랭킹·상점 조회는 연결하지 않음.",fallback);
                    }
                    npcs.finishTalk(id,generation,reply,System.currentTimeMillis());
                }); } catch(RuntimeException exception) { npcs.cancelTalk(id); throw exception; }
                yield Map.of("generation",generation);
            }
            case "cancelTalk" -> { npcs.cancelTalk(text(body,"npcId",32)); yield Map.of("cancelled",true); }
            case "omokStart" -> { resetGame(false); yield Map.of("started",true); }
            case "omokSample" -> { resetGame(true); yield Map.of("loaded",true); }
            case "omokMove" -> {
                if(!body.path("x").isIntegralNumber() || !body.path("y").isIntegralNumber()) throw new IllegalArgumentException("좌표는 정수입니다.");
                move(body.path("x").intValue(),body.path("y").intValue()); yield Map.of("accepted",true);
            }
            case "omokUndo" -> { undo(); yield Map.of("undone",true); }
            default -> throw new IllegalArgumentException("지원하지 않는 동작");
        };
    }
    private synchronized void resetGame(boolean sample) {
        board=new OmokBoard(); moves=new ArrayList<>(); gameId=UUID.randomUUID().toString(); gameVersion++; gameActive=true;
        analysis=OmokAnalyzer.unavailable(); gameEndAt=0; commentedVersion=-1;
        if(sample) {
            int[][] points={{7,7},{7,8},{8,7},{8,8},{9,7},{9,8},{10,7}};
            for(int[] point:points) place(point[0],point[1]);
        }
        npcs.omok(true); requestAnalysis();
    }
    private synchronized void move(int x,int y) {
        if(!gameActive) throw new IllegalArgumentException("먼저 새 경기를 시작해주세요.");
        place(x,y); requestAnalysis();
    }
    private void place(int x,int y) {
        var stone=moves.size()%2==0?OmokBoard.Stone.BLACK:OmokBoard.Stone.WHITE;
        board.place(stone,x,y); moves.add(new OmokBoard.Move(x,y,stone)); gameVersion++;
        analysis=OmokAnalyzer.unavailable();
        // The normal return grace starts after actual speech, not before a slow summary finishes.
        // A separate one-minute cap lets a park with no eligible spectator return without hanging forever.
        if(board.snapshot().outcome()!=OmokBoard.Outcome.PLAYING) gameEndAt=System.currentTimeMillis()+60_000;
    }
    private synchronized void undo() {
        board.undoPair(); moves=new ArrayList<>(moves.subList(0,moves.size()-2)); gameVersion++;
        analysis=OmokAnalyzer.unavailable(); requestAnalysis();
    }
    private void requestAnalysis() {
        analysisRequest.set(new BoardRequest(gameId,gameVersion,board.snapshot(),List.copyOf(moves)));
        startAnalysis();
    }
    private void startAnalysis() {
        if(!analyzing.compareAndSet(false,true)) return;
        try { submit(() -> {
            try {
                BoardRequest request;
                while((request=analysisRequest.getAndSet(null))!=null) {
                    var result=analyzer.analyze(request.board,request.moves);
                    if(request.board.outcome()!=OmokBoard.Outcome.PLAYING) {
                        var summary=texts.generate("친근한 오목 구경꾼","서버 확정 결과: "+request.board.outcome()
                                +" / 착수 수: "+request.board.moveCount()+". 기록에 없는 원인·판세·승률을 추가하지 말고 짧게 총평.",result.comment());
                        result=new OmokAnalyzer.Analysis(result.source(),result.advantage(),result.blackEstimate(),result.depth(),result.elapsedMs(),result.bestMove(),summary.text());
                    }
                    synchronized(this) {
                        if(gameId.equals(request.gameId) && gameVersion==request.version && !closed) {
                            analysis=result;
                        }
                    }
                }
            } finally { analyzing.set(false); if(analysisRequest.get()!=null) startAnalysis(); }
        }); } catch(RuntimeException exception) { analyzing.set(false); throw exception; }
    }
    public Map<String,Object> snapshot(String scope,boolean admin) {
        return snapshot(scope,admin,"");
    }
    public Map<String,Object> snapshot(String scope,boolean admin,String viewer) {
        scope=scope(scope);
        var data=store.read(); final String selected=scope;
        var visible=data.messages.stream().filter(m -> m.chat().scope().equals(selected)
                && (viewer.isEmpty() || m.chat().audience().isEmpty() || m.chat().audience().contains(viewer))).toList();
        if(visible.size()>120) visible=visible.subList(visible.size()-120,visible.size());
        var result=new LinkedHashMap<String,Object>();
        result.put("now",System.currentTimeMillis()); result.put("scope",scope);
        result.put("mode",live?"CHAT_RULES + CONFLICT_JEV + LLM":liveJev?"CHAT_RULES + CONFLICT_JEV + FIXED":"CHAT_RULES + CONFLICT_FIXTURE + FIXED");
        result.put("moderationWindowSize",10);
        result.put("moderationPolicyVersion","rules-conflict-advisory-v1");
        result.put("notifier",liveMm?"MATTERMOST":"LOCAL_CAPTURE");
        result.put("operations",operations.status());
        result.put("messages",visible.stream().map(m -> Map.of("id",m.chat().id(),"author",m.chat().author(),
                "text",m.hidden()?AiOperations.HIDDEN:m.chat().text(),"hidden",m.hidden(),"version",m.version(),
                "processed",m.processed(),"sentAt",m.chat().sentAt())).toList());
        result.put("npcs",npcs.views()); result.put("route",NpcDirector.route());
        result.put("visitors",visitors.views(scope));
        synchronized(this) {
            result.put("game",Map.of("id",gameId,"version",gameVersion,"active",gameActive,"board",board.snapshot(),
                    "analysis",analysis,"analyzing",analyzing.get(),"turn",moves.size()%2==0?"BLACK":"WHITE"));
        }
        if(admin) {
            result.put("reports",data.reports); result.put("notices",data.notices); result.put("incidents",data.incidents);
            result.put("reviewMessages",data.messages.stream().filter(m -> data.incidents.stream()
                    .anyMatch(c -> c.messageIds().contains(m.chat().id()))).toList());
            if(decisions instanceof JevDecisions jev) {
                result.put("jevUsage",jev.usage());
                result.put("moderationAssessments",data.assessments);
            }
            if(texts instanceof SpringAiText spring) result.put("llmUsage",spring.usage());
        }
        return result;
    }
    private void submit(Runnable work) { if(closed) throw new IllegalStateException("종료 중"); workers.execute(work); }
    private void submitQuietly(Runnable work) { try { submit(work); } catch(java.util.concurrent.RejectedExecutionException ignored) { } }
    private static String required(Map<String,String> env,String name) {
        String value=env.get(name); if(value==null || value.isBlank()) throw new IllegalArgumentException(name+" 설정 필요"); return value;
    }
    private static String moderationGuidance(Path file) {
        if(java.nio.file.Files.notExists(file)) return JevDecisions.DEFAULT_MODERATION_GUIDANCE;
        try(var input=java.nio.file.Files.newInputStream(file)) {
            byte[] bytes=input.readNBytes(4097);
            if(bytes.length>4096) throw new IllegalArgumentException("검수 질문 파일은4KiB 이하여야 합니다.");
            return new String(bytes,java.nio.charset.StandardCharsets.UTF_8);
        } catch(java.io.IOException exception) { throw new IllegalStateException("검수 질문 파일 읽기 실패"); }
    }
    public static String scope(String value) {
        if(!List.of("world:one","world:two","game:omok").contains(value)) throw new IllegalArgumentException("검수 채팅 범위 오류"); return value;
    }
    private static String text(JsonNode node,String key,int max) {
        if(!node.path(key).isTextual()) throw new IllegalArgumentException(key+" 문자열 필요");
        String value=node.path(key).asText();
        if(value.isBlank() || value.length()>max) throw new IllegalArgumentException(key+" 길이 오류"); return value;
    }
    @Override public void close() throws Exception {
        synchronized(this) { closed=true; }
        tick.shutdownNow(); workers.shutdownNow();
        if(!workers.awaitTermination(15,TimeUnit.SECONDS)) throw new IllegalStateException("AI 워커가 아직 종료되지 않았습니다.");
        store.close();
    }
    private record BoardRequest(String gameId,long version,OmokBoard.Snapshot board,List<OmokBoard.Move> moves) { }
}
