package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.LocalJokeContest.Submission;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** V170 MySQL store. User-row locking orders quota/reservation/refund transactions across instances. */
public final class JdbcJokeContestStore implements JokeContestStore {
    private final JdbcTemplate jdbc;private final TransactionTemplate tx;private final ObjectMapper mapper;private final Runnable close;
    private static final RowMapper<Submission> ROW=(rs,n)->read(rs);
    private static final String ORDER="score_x10 DESC,completed_at_ms,created_at_ms,id";
    public JdbcJokeContestStore(DataSource source,ObjectMapper mapper){this(source,mapper,()->{});}
    public JdbcJokeContestStore(DataSource source,ObjectMapper mapper,Runnable close){jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));this.mapper=mapper;this.close=close;}
    private static Submission read(ResultSet r)throws SQLException{
        Number score=(Number)r.getObject("score_x10");Number completed=(Number)r.getObject("completed_at_ms");
        return new Submission(r.getString("id"),r.getString("user_id"),r.getString("nickname"),r.getString("contest_date"),r.getString("question"),r.getString("answer"),r.getString("normalized_hash"),r.getString("request_key"),r.getString("status"),score==null?null:score.intValue(),r.getInt("wordplay_x10"),r.getInt("wit_x10"),r.getInt("originality_x10"),r.getString("reason"),r.getString("reaction"),r.getString("reaction_source"),r.getLong("created_at_ms"),completed==null?0:completed.longValue(),r.getString("judge_version"));
    }
    private void lockUser(String user,boolean active){
        var rows=jdbc.queryForList("SELECT id,deleted_at FROM users WHERE id=? FOR UPDATE",Long.parseLong(user));
        if(rows.isEmpty()||(active&&rows.getFirst().get("deleted_at")!=null))throw new IllegalArgumentException("활성 회원만 도전할 수 있습니다.");
    }
    private void expireUser(String user,long now){
        var expired=jdbc.query("SELECT * FROM joke_contest_submissions WHERE user_id=? AND status='PENDING' AND created_at_ms<?",ROW,Long.parseLong(user),now-60_000);
        for(var s:expired){int count=jdbc.update("UPDATE joke_contest_submissions SET status='FAILED',active_hash=NULL,reason='TIMEOUT',reaction=?,reaction_source='FIXED',completed_at_ms=? WHERE id=? AND status='PENDING'","심사가 중단되거나 시간이 길어졌네. 도전 기회는 돌려주겠네.",now,s.id());if(count==1)refund(s);}
    }
    private void refund(Submission s){
        if(jdbc.update("UPDATE joke_contest_daily_quotas SET used_attempts=used_attempts-1 WHERE user_id=? AND contest_date=? AND used_attempts>0",Long.parseLong(s.userId()),s.date())!=1)
            throw new IllegalStateException("참여권 반환 정합성 오류");
    }
    @Override public Reservation reserve(Submission d){return tx.execute(status->{
        lockUser(d.userId(),true);
        var same=jdbc.query("SELECT * FROM joke_contest_submissions WHERE user_id=? AND request_key=?",ROW,Long.parseLong(d.userId()),d.key());
        if(!same.isEmpty()){JokeContestStore.sameRequest(same.getFirst(),d);return new Reservation(same.getFirst(),false);}
        expireUser(d.userId(),d.createdAt());
        if(!jdbc.queryForList("SELECT id FROM joke_contest_submissions WHERE user_id=? AND active_hash=? LIMIT 1",Long.parseLong(d.userId()),d.hash()).isEmpty())throw new IllegalArgumentException("이미 제출한 작품입니다. 다른 개그로 도전해주세요.");
        jdbc.update("INSERT IGNORE INTO joke_contest_daily_quotas(user_id,contest_date) VALUES(?,?)",Long.parseLong(d.userId()),d.date());
        var quota=jdbc.queryForMap("SELECT used_attempts,last_submitted_at_ms FROM joke_contest_daily_quotas WHERE user_id=? AND contest_date=? FOR UPDATE",Long.parseLong(d.userId()),d.date());
        if(((Number)quota.get("used_attempts")).intValue()>=3)throw new IllegalArgumentException("오늘의 도전 기회를 모두 사용했어요.");
        Number previous=(Number)quota.get("last_submitted_at_ms");if(previous!=null&&d.createdAt()<previous.longValue()+2000)throw new IllegalArgumentException("잠시 후 다시 제출해주세요.");
        jdbc.update("INSERT INTO joke_contest_submissions(id,user_id,nickname,contest_date,question,answer,normalized_hash,active_hash,request_key,status,score_x10,wordplay_x10,wit_x10,originality_x10,reason,reaction,reaction_source,judge_version,created_at_ms,completed_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,0,0,0,?,?,?,?,?,NULL)",
                d.id(),Long.parseLong(d.userId()),d.nickname(),d.date(),d.question(),d.answer(),d.hash(),d.hash(),d.key(),"PENDING",d.reason(),d.reaction(),d.reactionSource(),d.judgeVersion(),d.createdAt());
        jdbc.update("UPDATE joke_contest_daily_quotas SET used_attempts=used_attempts+1,last_submitted_at_ms=? WHERE user_id=? AND contest_date=?",d.createdAt(),Long.parseLong(d.userId()),d.date());
        return new Reservation(d,true);
    });}
    @Override public boolean pending(String id,long now){var s=find(id);if(s.isEmpty())return false;return Boolean.TRUE.equals(tx.execute(status->{lockUser(s.get().userId(),false);expireUser(s.get().userId(),now);return find(id).filter(r->r.status().equals("PENDING")).isPresent();}));}
    @Override public void finish(Submission result,long now){tx.executeWithoutResult(status->{
        lockUser(result.userId(),false);expireUser(result.userId(),now);var existing=find(result.id());if(existing.isEmpty()||!existing.get().status().equals("PENDING"))return;
        var s=existing.get();
        int updated=jdbc.update("UPDATE joke_contest_submissions SET status=?,score_x10=?,wordplay_x10=?,wit_x10=?,originality_x10=?,reason=?,reaction=?,reaction_source=?,completed_at_ms=?,active_hash=? WHERE id=? AND status='PENDING'",
                result.status(),result.scoreX10(),result.wordplayX10(),result.witX10(),result.originalityX10(),result.reason(),result.reaction(),result.reactionSource(),result.completedAt(),result.status().equals("FAILED")?null:s.hash(),s.id());
        if(updated==1&&result.status().equals("FAILED"))refund(s);
    });}
    @Override public void settle(long now){
        var users=jdbc.queryForList("SELECT DISTINCT user_id FROM joke_contest_submissions WHERE status='PENDING' AND created_at_ms<? LIMIT 100",Long.class,now-60_000);
        for(long user:users)tx.executeWithoutResult(status->{lockUser(Long.toString(user),false);expireUser(Long.toString(user),now);});
        var time=Instant.ofEpochMilli(now).atZone(ZoneId.of("Asia/Seoul"));String cutoff=time.toLocalDate().minusDays(time.toLocalTime().isBefore(LocalTime.of(0,5))?2:1).toString();
        var days=jdbc.queryForList("SELECT DISTINCT s.contest_date FROM joke_contest_submissions s LEFT JOIN joke_contest_daily_winners w ON w.contest_date=s.contest_date WHERE s.status='SCORED' AND s.contest_date<=? AND w.contest_date IS NULL ORDER BY s.contest_date LIMIT 366",String.class,cutoff);
        for(String day:days){var ranked=ranked(day);if(!ranked.isEmpty()){var winner=ranked.getFirst();try{jdbc.update("INSERT IGNORE INTO joke_contest_daily_winners(contest_date,submission_id,snapshot_json,finalized_at_ms) VALUES(?,?,?,?)",day,winner.id(),mapper.writeValueAsString(winner),now);}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException("우승 기록 저장 실패");}}}
    }
    @Override public List<Submission> mine(String user,String date){return jdbc.query("SELECT * FROM joke_contest_submissions WHERE user_id=? AND contest_date=? ORDER BY created_at_ms,id",ROW,Long.parseLong(user),date);}
    @Override public Optional<Submission> find(String id){return jdbc.query("SELECT * FROM joke_contest_submissions WHERE id=?",ROW,id).stream().findFirst();}
    @Override public List<Submission> ranked(String date){return jdbc.query("SELECT ranked.* FROM (SELECT s.*,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY "+ORDER+") AS per_user FROM joke_contest_submissions s WHERE contest_date=? AND status='SCORED') ranked WHERE per_user=1 ORDER BY "+ORDER+" LIMIT 10",ROW,date);}
    private Submission snapshot(String json){try{return mapper.readValue(json,Submission.class);}catch(java.io.IOException e){throw new IllegalStateException("우승 기록 읽기 실패");}}
    @Override public Optional<Submission> winner(String date){return jdbc.queryForList("SELECT snapshot_json FROM joke_contest_daily_winners WHERE contest_date=?",String.class,date).stream().findFirst().map(this::snapshot);}
    @Override public List<Submission> winners(){return jdbc.queryForList("SELECT snapshot_json FROM joke_contest_daily_winners ORDER BY contest_date DESC",String.class).stream().map(this::snapshot).toList();}
    @Override public String mode(){return "MYSQL";}
    @Override public void close(){close.run();}
}
