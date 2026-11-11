package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Shared asynchronous contest flow; file and JDBC stores own atomic participation transitions. */
public final class LocalJokeContest implements AutoCloseable {
    public record Submission(String id,String userId,String nickname,String date,String question,String answer,String hash,String key,
            String status,Integer scoreX10,int wordplayX10,int witX10,int originalityX10,String reason,String reaction,String reactionSource,
            long createdAt,long completedAt,String judgeVersion) { }
    public static final class Data {public int schema=1;public List<Submission> submissions=new ArrayList<>();public Map<String,Submission> winners=new TreeMap<>();}
    private static final ZoneId SEOUL=ZoneId.of("Asia/Seoul");
    private final ObjectMapper mapper;private final JokeContestStore store;
    private final JokeJudge judge;private final AiText text;private final Clock clock;
    private final AiMetrics metrics=new AiMetrics();
    private final ThreadPoolExecutor workers=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(16),Thread.ofPlatform().daemon(true).name("joke-contest-",0).factory());
    private boolean closed;
    public LocalJokeContest(ObjectMapper mapper,Path directory,JokeJudge judge,AiText text,Clock clock)throws java.io.IOException {
        this(mapper,new JsonJokeContestStore(mapper,directory,clock.millis()),judge,text,clock);
    }
    public LocalJokeContest(ObjectMapper mapper,Path directory,JokeJudge judge,AiText text,Clock clock,boolean unlimited)throws java.io.IOException {
        this(mapper,new JsonJokeContestStore(mapper,directory,clock.millis(),unlimited),judge,text,clock);
    }
    public LocalJokeContest(ObjectMapper mapper,JokeContestStore store,JokeJudge judge,AiText text,Clock clock){this.mapper=mapper;this.store=store;this.judge=judge;this.text=text;this.clock=clock;}
    private String today(){return LocalDate.now(clock.withZone(SEOUL)).toString();}
    static Submission finished(Submission s,String status,Integer score,int word,int wit,int original,String reason,String reaction,String source,long now){return new Submission(s.id(),s.userId(),s.nickname(),s.date(),s.question(),s.answer(),s.hash(),s.key(),status,score,word,wit,original,reason,reaction,source,s.createdAt(),now,s.judgeVersion());}
    private String input(String value,int min,int max){if(value==null)throw new IllegalArgumentException("문제와 정답을 입력해주세요.");String v=value.strip();int size=v.codePointCount(0,v.length());if(size<min||size>max||v.matches("(?s).*[\\p{Cntrl}&&[^\\r\\n\\t]].*"))throw new IllegalArgumentException("문제는 2~100자, 정답은 1~60자로 입력해주세요.");return v;}
    static String normalizedHash(String q,String a){try{var md=java.security.MessageDigest.getInstance("SHA-256");return HexFormat.of().formatHex(md.digest((normalize(q)+"\u0000"+normalize(a)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static String normalize(String v){return java.text.Normalizer.normalize(v,java.text.Normalizer.Form.NFKC).replaceAll("[\\p{Z}\\s\\p{P}\\p{Cf}]","").toLowerCase(Locale.ROOT);}
    public synchronized Submission submit(String user,String nickname,String question,String answer,String key,boolean consent) {
        if(closed)throw new IllegalStateException("대회 종료 중");
        String q=input(question,2,100),a=input(answer,1,60);
        if(!consent)throw new IllegalArgumentException("상위 작품의 문제·정답 공개 안내를 확인해주세요.");
        if(key==null||!key.matches("[a-zA-Z0-9_-]{8,80}"))throw new IllegalArgumentException("제출 요청 식별자가 필요합니다.");
        var reservation=store.reserve(new Submission(UUID.randomUUID().toString(),user,nickname,today(),q,a,normalizedHash(q,a),key,"PENDING",null,0,0,0,"","심사하고 있네. 잠시 기다려 주게.","PENDING",clock.millis(),0,judge.mode()));
        var row=reservation.submission();if(!reservation.created())return row;
        try{workers.execute(()->evaluate(row));}catch(RejectedExecutionException busy){complete(finished(row,"FAILED",null,0,0,0,"BUSY","심사가 밀려 있네. 도전 기회는 돌려주겠네.","FIXED",clock.millis()));}
        return row;
    }
    private void evaluate(Submission row) {
        if(!pending(row.id()))return;
        long started=System.nanoTime();metrics.duration("queue_wait",Math.max(0,clock.millis()-row.createdAt())*1_000_000);
        Submission done;
        try {
            var result=judge.evaluate(row.question(),row.answer(),references(row));String status=result.status(),reaction,source="FIXED";Integer score=null;
            if(status.equals("SCORED")) {
                if(!pending(row.id()))return;
                score=result.wordplayX10()+result.witX10()+result.originalityX10();
                reaction="자네의 말장난 한 수, 잘 들었네.";
                try {
                    AiText.Reply generated;
                    if(result.integratedReaction())generated=new AiText.Reply(result.reaction(),"SPRING_AI");
                    else {
                        long reactionStarted=System.nanoTime();metrics.increment("legacy_reaction.requests");
                        try{generated=text.generate(JokeJudge.PERSONA+"개그의 구체적인 말장난과 잘된 점 또는 아쉬운 점을 한국어 두세 문장 120자 이내로 설명하라. 점수나 숫자·개인정보·욕설·실제 원작자 주장은 금지. 유사 감점은 서버가 안내하므로 중복 언급하지 마라.",
                            mapper.writeValueAsString(Map.of("question",row.question(),"answer",row.answer(),"evaluation",result.reason(),"wordplayX10",result.wordplayX10(),"witX10",result.witX10(),"originalityX10",result.originalityX10())),reaction);}
                        finally{metrics.duration("legacy_reaction",System.nanoTime()-reactionStarted);}
                    }
                    if(!pending(row.id()))return;
                    if(generated!=null&&generated.source().equals("SPRING_AI")&&generated.text()!=null&&!generated.text().isBlank()&&generated.text().length()<=180&&!generated.text().matches("(?s).*(?:[0-9０-９]|점수|등수|만점|백\\s*점).*")&&judge.safeReaction(generated.text())){reaction=generated.text().strip();source=generated.source();}
                }catch(Exception unavailable){/* The score is already final; safe fixed reaction is a successful result. */}
                if(source.equals("FIXED"))metrics.increment("reaction.fallbacks");
                if(result.reason().equals(JokeJudge.SIMILAR_REASON))reaction+=" "+JokeJudge.SIMILAR_REASON;
                reaction=laughter(score)+" "+reaction.replaceFirst("^(?:허허+|하하+|푸하하핫)[!！,.。…~\\s]*", "");
                reaction+=" 이번 개그는 "+String.format(Locale.ROOT,"%.1f",score/10.0)+"점일세!";
            }else reaction=switch(status){case "REJECTED" -> "허허, 다 같이 보는 자리엔 어울리지 않는 표현이구먼. 다른 개그로 도전해 보게.";case "REVIEW" -> "공개하기에 적절한지 확신하기 어렵구먼. 이번 작품은 비공개로 두겠네.";default -> "문제와 정답의 말장난이 조금 약하구먼. 다음엔 한 방을 준비해 보게!";};
            done=finished(row,status,score,result.wordplayX10(),result.witX10(),result.originalityX10(),result.reason(),reaction,source,clock.millis());
        }catch(Exception unavailable){done=finished(row,"FAILED",null,0,0,0,"PROVIDER_FAILURE","잠시 심사에 문제가 생겼네. 이번 도전 기회는 돌려주겠네.","FIXED",clock.millis());}
        complete(done);metrics.duration("processing",System.nanoTime()-started);metrics.duration("end_to_end",Math.max(0,clock.millis()-row.createdAt())*1_000_000);
    }
    private synchronized boolean pending(String id){return !closed&&store.pending(id,clock.millis());}
    static String laughter(int scoreX10){return scoreX10>=800?"푸하하핫!!":scoreX10>=600?"허허허!":scoreX10>=400?"허허.":"허허…";}
    private synchronized List<JokeJudge.Reference> references(Submission row){
        settle();
        var selected=new LinkedHashMap<String,JokeJudge.Reference>();
        java.util.stream.Stream.concat(store.ranked(row.date()).stream().limit(10),store.winners().stream().filter(s->s.date().compareTo(row.date())<0))
            .filter(s->!s.id().equals(row.id())&&s.status().equals("SCORED"))
            .forEach(s->selected.putIfAbsent(s.id(),new JokeJudge.Reference(s.id(),s.question(),s.answer())));
        metrics.add("similarity.references",selected.size());
        return List.copyOf(selected.values());
    }
    private synchronized void complete(Submission row){if(!closed){store.finish(row,clock.millis());metrics.increment("worker.result."+row.status());}}
    static final Comparator<Submission> ORDER=Comparator.comparingInt((Submission s)->s.scoreX10()).reversed().thenComparingLong(Submission::completedAt).thenComparingLong(Submission::createdAt).thenComparing(Submission::id);
    private void settle(){store.settle(clock.millis());}
    public Map<String,Long> metrics(){var result=new TreeMap<>(metrics.snapshot());judge.usage().forEach((k,v)->result.put("provider."+k,v));return Map.copyOf(result);}
    public synchronized Map<String,Object> mine(String user){settle();var rows=store.mine(user,today());long used=rows.stream().filter(s->!s.status().equals("FAILED")).count();return Map.of("date",today(),"remaining",store.unlimitedAttempts()?-1L:Math.max(0,3-used),"unlimitedAttempts",store.unlimitedAttempts(),"submissions",rows,"judge",judge.mode(),"reactionProvider",text.mode(),"storage",store.mode(),"metrics",metrics());}
    public synchronized Submission own(String user,String id){settle();return store.find(id).filter(s->s.userId().equals(user)).orElseThrow(()->new IllegalArgumentException("내 제출 기록만 조회할 수 있습니다."));}
    private Map<String,Object> summary(Submission s,boolean question){var result=new LinkedHashMap<String,Object>();result.put("id",s.id());result.put("nickname",s.nickname());result.put("scoreX10",s.scoreX10());if(question)result.put("question",s.question());return result;}
    public synchronized List<Map<String,Object>> rankings(String date){settle();LocalDate.parse(date);var rows=store.ranked(date);var result=new ArrayList<Map<String,Object>>();for(int i=0;i<Math.min(10,rows.size());i++){var row=summary(rows.get(i),i<5);row.put("rank",i+1);result.add(row);}return result;}
    public synchronized Map<String,Object> reveal(String id){settle();var s=store.find(id).filter(r->r.status().equals("SCORED")).orElseThrow(()->new IllegalArgumentException("공개 작품 없음"));if(!store.ranked(s.date()).stream().limit(5).anyMatch(r->r.id().equals(id)))throw new IllegalArgumentException("상위 5위 작품만 정답을 공개합니다.");return Map.of("id",id,"answer",s.answer(),"reaction",s.reaction(),"scoreX10",s.scoreX10());}
    public synchronized Map<String,Object> yesterday(){settle();String day=LocalDate.parse(today()).minusDays(1).toString();return store.winner(day).<Map<String,Object>>map(s->Map.of("date",day,"available",true,"winner",summary(s,true))).orElseGet(()->Map.of("date",day,"available",false));}
    public synchronized List<Map<String,Object>> hall(){settle();return store.winners().stream().map(w->{var s=summary(w,true);s.put("date",w.date());return s;}).toList();}
    public synchronized void close()throws java.io.IOException{closed=true;workers.shutdownNow();store.close();}
}
