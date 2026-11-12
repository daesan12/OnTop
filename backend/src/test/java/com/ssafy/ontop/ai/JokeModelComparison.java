package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

/** Explicit, bounded live comparison. No Spring context, shared DB, MM, ranking or game state. */
public final class JokeModelComparison {
    record Sample(String id,String question,String answer,boolean duplicate){}
    private static final List<Sample> SAMPLES=List.of(new Sample("window","1+1=?","창문~~",false),
            new Sample("window-duplicate","1+1=?sd","창문~~s",true),new Sample("king","왕이넘어지면?","킹콩",false),
            new Sample("sea","바다가 화나면?","열바다",false));
    private static final List<String> MODELS=List.of("gpt-4.1-mini","gpt-5.4-mini");
    static double reservation(String model,int requestBytes){
        if(!MODELS.contains(model)||requestBytes>20000)throw new IllegalArgumentException("Comparison model/input limit");
        double input=model.equals("gpt-4.1-mini")?.4:.75,output=model.equals("gpt-4.1-mini")?1.6:4.5;
        // Entire UTF-8 request plus 1024 framing tokens: deliberately conservative, not a tokenizer.
        return ((requestBytes+1024)*input+500*output)/1_000_000;
    }
    public static void main(String[] args)throws Exception {
        String llm=System.getenv("OPENAI_API_KEY"),jev=System.getenv("JEV_API_KEY");
        if(llm==null||llm.isBlank()||jev==null||jev.isBlank())throw new IllegalStateException("OPENAI_API_KEY and JEV_API_KEY must be set in this shell. Never put them in arguments.");
        var mapper=new ObjectMapper();String configured=System.getenv("AI_JOKE_COMPARISON_OUTPUT");
        Path output=configured==null?Path.of(".gradle","joke-comparison-"+System.currentTimeMillis()):Path.of(configured);
        if(Files.exists(output))throw new IllegalArgumentException("Comparison output must be a new directory; old runs are never reused.");
        Files.createDirectories(output);Path eventsFile=output.resolve("events.jsonl");Files.createFile(eventsFile);
        var report=new ArrayList<Map<String,Object>>();double reserved=0,actual=0;int calls=0;
        try {
            for(var sample:SAMPLES)for(String model:MODELS){
                var guard=new JevJokeJudge(mapper,jev,System.getenv().getOrDefault("JEV_MODEL","jev-1.14.0"));
                var judge=new LlmJokeJudge(mapper,llm,model,guard);
                var refs=sample.duplicate()?List.of(new JokeJudge.Reference("comparison-window","1+1=?","창문~~")):List.<JokeJudge.Reference>of();
                double next=reservation(model,mapper.writeValueAsBytes(judge.requestPayload(sample.question(),sample.answer(),refs)).length);
                if(reserved+next>.10||calls>=8)throw new IllegalStateException("Comparison $0.10 reservation/call limit reached; no further requests sent.");
                reserved+=next;calls++;
                var events=new CopyOnWriteArrayList<Map<String,Object>>();Clock clock=Clock.systemUTC();
                var store=new JsonJokeContestStore(mapper,output.resolve("cases").resolve(sample.id()+"-"+model),clock.millis(),true);
                if(sample.duplicate()){
                    long now=clock.millis();var reference=new LocalJokeContest.Submission("comparison-window","reference","비교 기준",LocalDate.now(ZoneId.of("Asia/Seoul")).toString(),"1+1=?","창문~~",LocalJokeContest.normalizedHash("1+1=?","창문~~"),"comparison-reference","PENDING",null,0,0,0,"","","PENDING",now,0,"comparison-fixture");
                    store.reserve(reference);store.finish(LocalJokeContest.finished(reference,"SCORED",900,400,400,100,"비교 기준","비교 기준","FIXED",now),now);
                }
                try(var contest=new LocalJokeContest(mapper,store,judge,AiText.fixed(),clock,events::add)){
                    var row=contest.submit("comparison","로컬 비교",sample.question(),sample.answer(),"comparison-request",true);
                    long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(45);
                    while(contest.own("comparison",row.id()).status().equals("PENDING")&&System.nanoTime()<deadline)Thread.sleep(25);
                    var done=contest.own("comparison",row.id());
                    var entry=new LinkedHashMap<String,Object>();entry.put("case",sample.id());entry.put("model",model);entry.put("result",done);entry.put("reservationUsd",next);
                    for(var event:events){
                        if("llm_response".equals(event.get("stage"))){double rate=model.equals("gpt-4.1-mini")?.4:.75,out=model.equals("gpt-4.1-mini")?1.6:4.5;actual+=(((Number)event.get("inputTokens")).doubleValue()*rate+((Number)event.get("outputTokens")).doubleValue()*out)/1_000_000;}
                        Files.writeString(eventsFile,mapper.writeValueAsString(Map.of("case",sample.id(),"model",model,"event",event))+"\n",StandardCharsets.UTF_8,StandardOpenOption.APPEND);
                    }
                    report.add(entry);System.out.println(sample.id()+" / "+model+" / "+done.status()+" / scoreX10="+done.scoreX10()+" / reaction="+done.reactionSource());
                    if(done.status().equals("FAILED")||done.status().equals("PENDING"))throw new IllegalStateException("Provider failed/timed out; stopping without retries. See diagnostics.");
                }
            }
        }finally{
            Files.writeString(output.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("models",MODELS,"pricingChecked","2026-11-12","maxCalls",8,"maxReservationUsd",.10,"reservedUsd",reserved,"reportedTokenCostUsd",actual,"results",report)),StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
            System.out.println("Comparison report: "+output.toAbsolutePath()+"; reported token cost USD="+actual+"; Jev cost not included.");
        }
    }
}
