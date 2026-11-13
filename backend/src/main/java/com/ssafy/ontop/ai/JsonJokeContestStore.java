package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.LocalJokeContest.Data;
import com.ssafy.ontop.ai.LocalJokeContest.Submission;
import java.nio.channels.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;

/** Backwards-compatible single-process offline file adapter. */
final class JsonJokeContestStore implements JokeContestStore {
    private final ObjectMapper mapper;private final Path file;private final FileChannel channel;private final FileLock lock;
    private Data data;private final Map<String,Long> attempts=new HashMap<>();
    private final boolean unlimited;
    JsonJokeContestStore(ObjectMapper mapper,Path directory,long now)throws java.io.IOException {
        this(mapper,directory,now,false);
    }
    JsonJokeContestStore(ObjectMapper mapper,Path directory,long now,boolean unlimited)throws java.io.IOException {
        this.unlimited=unlimited;
        this.mapper=mapper;Files.createDirectories(directory);file=directory.resolve("contest.json");
        channel=FileChannel.open(directory.resolve("contest.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);
        FileLock acquired;try{acquired=channel.tryLock();}catch(RuntimeException e){channel.close();throw e;}
        if(acquired==null){channel.close();throw new java.io.IOException("대회 저장소 사용 중");}lock=acquired;
        try{if(Files.exists(file)&&Files.size(file)>16*1024*1024)throw new java.io.IOException("대회 저장 한도 초과");
            data=Files.exists(file)?mapper.readValue(file.toFile(),Data.class):new Data();
            if(data.schema!=1||data.submissions==null||data.winners==null)throw new java.io.IOException("대회 저장 형식 오류");
            var next=copy();boolean changed=false;
            for(int i=0;i<next.submissions.size();i++){var s=next.submissions.get(i);if(s.status().equals("PENDING")){next.submissions.set(i,failed(s,"RESTART",now));changed=true;}}
            if(changed)save(next);
        }catch(java.io.IOException|RuntimeException e){lock.release();channel.close();throw e;}
    }
    private Data copy(){return mapper.convertValue(data,Data.class);}
    private void save(Data next){try{byte[] bytes=mapper.writeValueAsBytes(next);if(bytes.length>16*1024*1024||next.submissions.size()>5000)throw new IllegalStateException("로컬 대회 저장 한도 초과");
        Path temp=file.resolveSibling("contest.next.json");try(var out=FileChannel.open(temp,StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING,StandardOpenOption.WRITE)){var b=java.nio.ByteBuffer.wrap(bytes);while(b.hasRemaining())out.write(b);out.force(true);}
        Files.move(temp,file,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);data=next;
    }catch(java.io.IOException e){throw new IllegalStateException("대회 기록 저장 실패");}}
    static Submission failed(Submission s,String reason,long now){return LocalJokeContest.finished(s,"FAILED",null,0,0,0,reason,"심사가 중단되거나 시간이 길어졌네. 도전 기회는 돌려주겠네.","FIXED",now);}
    @Override public synchronized Reservation reserve(Submission draft){
        for(var s:data.submissions)if(s.userId().equals(draft.userId())&&s.key().equals(draft.key())){JokeContestStore.sameRequest(s,draft);return new Reservation(s,false);}
        settle(draft.createdAt());
        if(!unlimited&&mine(draft.userId(),draft.date()).stream().filter(s->!s.status().equals("FAILED")).count()>=3)throw new IllegalArgumentException("오늘의 도전 기회를 모두 사용했어요.");
        if(draft.createdAt()<attempts.getOrDefault(draft.userId(),Long.MIN_VALUE)+2000)throw new IllegalArgumentException("잠시 후 다시 제출해주세요.");
        var next=copy();next.submissions.add(draft);save(next);attempts.put(draft.userId(),draft.createdAt());return new Reservation(draft,true);
    }
    @Override public synchronized boolean pending(String id,long now){settle(now);return find(id).filter(s->s.status().equals("PENDING")).isPresent();}
    @Override public synchronized void finish(Submission row,long now){if(!pending(row.id(),now))return;var next=copy();for(int i=0;i<next.submissions.size();i++)if(next.submissions.get(i).id().equals(row.id())){next.submissions.set(i,row);save(next);return;}}
    @Override public synchronized void settle(long now){
        var next=copy();boolean changed=false;
        for(int i=0;i<next.submissions.size();i++){var s=next.submissions.get(i);if(s.status().equals("PENDING")&&now-s.createdAt()>60_000){next.submissions.set(i,failed(s,"TIMEOUT",now));changed=true;}}
        if(changed)save(next);next=copy();changed=false;
        for(String day:data.submissions.stream().map(Submission::date).distinct().toList())if(!next.winners.containsKey(day)&&now>=LocalDate.parse(day).plusDays(1).atTime(0,5).atZone(ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli()){
            var rows=ranked(day);if(!rows.isEmpty()){next.winners.put(day,rows.getFirst());changed=true;}}
        if(changed)save(next);
    }
    @Override public synchronized List<Submission> mine(String user,String date){return data.submissions.stream().filter(s->s.userId().equals(user)&&s.date().equals(date)).toList();}
    @Override public synchronized Optional<Submission> find(String id){return data.submissions.stream().filter(s->s.id().equals(id)).findFirst();}
    @Override public synchronized List<Submission> ranked(String date){var best=new HashMap<String,Submission>();for(var s:data.submissions)if(s.date().equals(date)&&s.status().equals("SCORED"))best.merge(s.userId(),s,(a,b)->LocalJokeContest.ORDER.compare(a,b)<=0?a:b);return best.values().stream().sorted(LocalJokeContest.ORDER).limit(10).toList();}
    @Override public synchronized Optional<Submission> winner(String date){return Optional.ofNullable(data.winners.get(date));}
    @Override public synchronized List<Submission> winners(){return data.winners.entrySet().stream().sorted(Map.Entry.<String,Submission>comparingByKey().reversed()).map(Map.Entry::getValue).toList();}
    @Override public String mode(){return "JSON";}
    @Override public boolean unlimitedAttempts(){return unlimited;}
    @Override public synchronized void close()throws java.io.IOException{lock.release();channel.close();}
}
