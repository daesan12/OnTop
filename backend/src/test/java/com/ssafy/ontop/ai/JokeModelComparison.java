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
    private static final List<Sample> SAMPLES=List.of(new Sample("car","자동차를 톡 치면?","카톡",false),
            new Sample("sea","바다가 화나면?","열바다",false),new Sample("unrelated","소가 웃으면?","오늘 점심은 김치찌개",false),
            new Sample("car-duplicate","자동차를 살짝 톡 건드리면?","카톡",true));
    private static final List<String> MODELS=List.of("gpt-4.1-mini","gpt-5.4-mini");
    static List<Sample> mini54Samples(){return List.of(
            new Sample("car","자동차를 톡 치면?","카톡",false),
            new Sample("king","왕이 넘어지면?","킹콩",false),
            new Sample("icecream","도둑이 가장 싫어하는 아이스크림은?","누가바",false),
            new Sample("number","세상에서 가장 쉬운 숫자는?","십구만",false),
            new Sample("sea","바다가 화나면?","열바다",false),
            new Sample("court","신하가 왕에게 공을 던지며 하는 말은?","송구하옵니다",false),
            new Sample("unrelated","소가 웃으면?","오늘 점심은 김치찌개",false),
            new Sample("nonsense","달이 춤을 추면?","라푸쪼멜뚜",false),
            new Sample("car-duplicate","자동차를 살짝 톡 건드리면?","카톡",true),
            new Sample("car-repeat","자동차를 톡 치면?","카톡",false));}
    static double reservation(String model,int requestBytes){
        if(!MODELS.contains(model)||requestBytes>20000)throw new IllegalArgumentException("Comparison model/input limit");
        double input=model.equals("gpt-4.1-mini")?.4:.75,output=model.equals("gpt-4.1-mini")?1.6:4.5;
        // Entire UTF-8 request plus 1024 framing tokens: deliberately conservative, not a tokenizer.
        return ((requestBytes+1024)*input+LlmJokeJudge.MAX_OUTPUT_TOKENS*output)/1_000_000;
    }
    public static void main(String[] args)throws Exception {
        if(args.length>1||(args.length==1&&!args[0].equals("--mini54-suite")))throw new IllegalArgumentException("Unknown comparison option");
        boolean mini54=args.length==1;
        var samples=mini54?mini54Samples():SAMPLES;
        var models=mini54?List.of("gpt-5.4-mini"):MODELS;
        int maxCalls=mini54?10:8;
        String llm=System.getenv("OPENAI_API_KEY"),jev=System.getenv("JEV_API_KEY");
        if(llm==null||llm.isBlank()||jev==null||jev.isBlank())throw new IllegalStateException("OPENAI_API_KEY and JEV_API_KEY must be set in this shell. Never put them in arguments.");
        var mapper=new ObjectMapper();String configured=System.getenv("AI_JOKE_COMPARISON_OUTPUT");
        Path output=configured==null?Path.of(".gradle","joke-comparison-"+System.currentTimeMillis()):Path.of(configured);
        if(Files.exists(output))throw new IllegalArgumentException("Comparison output must be a new directory; old runs are never reused.");
        Files.createDirectories(output);Path eventsFile=output.resolve("events.jsonl");Files.createFile(eventsFile);
        var report=new ArrayList<Map<String,Object>>();double reserved=0,actual=0;int calls=0;
        try {
            for(var sample:samples)for(String model:models){
                var guard=new JevJokeJudge(mapper,jev,System.getenv().getOrDefault("JEV_MODEL","jev-1.14.0"));
                var judge=new LlmJokeJudge(mapper,llm,model,guard);
                var referenceSample=samples.getFirst();
                var refs=sample.duplicate()?List.of(new JokeJudge.Reference("comparison-reference",referenceSample.question(),referenceSample.answer())):List.<JokeJudge.Reference>of();
                double next=reservation(model,mapper.writeValueAsBytes(judge.requestPayload(sample.question(),sample.answer(),refs)).length);
                if(reserved+next>.10||calls>=maxCalls)throw new IllegalStateException("Comparison $0.10 reservation/call limit reached; no further requests sent.");
                reserved+=next;calls++;
                var events=new CopyOnWriteArrayList<Map<String,Object>>();Clock clock=Clock.systemUTC();
                var store=new JsonJokeContestStore(mapper,output.resolve("cases").resolve(sample.id()+"-"+model),clock.millis(),true);
                if(sample.duplicate()){
                    long now=clock.millis();var reference=new LocalJokeContest.Submission("comparison-reference","reference","비교 기준",LocalDate.now(ZoneId.of("Asia/Seoul")).toString(),referenceSample.question(),referenceSample.answer(),LocalJokeContest.normalizedHash(referenceSample.question(),referenceSample.answer()),"comparison-reference","PENDING",null,0,0,0,"","","PENDING",now,0,"comparison-fixture");
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
            Files.writeString(output.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("suite",mini54?"mini54-diverse":"two-models","models",models,"pricingChecked","2026-11-12","maxCalls",maxCalls,"maxReservationUsd",.10,"reservedUsd",reserved,"reportedTokenCostUsd",actual,"results",report)),StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
            System.out.println("Comparison report: "+output.toAbsolutePath()+"; reported token cost USD="+actual+"; Jev cost not included.");
        }
    }
}
