package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.LocalAiStore.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import java.util.function.*;
import javax.sql.DataSource;

/** Normalized archive with bounded work views. One active AI worker per database, enforced by MySQL. */
public final class JdbcAiStore implements AiStore {
    private final ObjectMapper mapper;
    private final Connection connection;
    private final String ownerLock;
    private boolean closed;

    public JdbcAiStore(DataSource source,ObjectMapper mapper) {
        this.mapper=mapper;
        Connection acquired=null;
        String acquiredName=null;boolean ownsLock=false;
        try {
            acquired=source.getConnection();
            connection=acquired;
            String database=scalar("SELECT DATABASE()");
            if(database==null)throw new SQLException("AI database is required");
            ownerLock="ontop.ai."+UUID.nameUUIDFromBytes(database.getBytes(StandardCharsets.UTF_8));
            acquiredName=ownerLock;
            if(!"1".equals(scalar("SELECT GET_LOCK(?,0)",ownerLock)))throw new SQLException("AI worker already owns this database");
            ownsLock=true;
            // Fail at startup if Flyway has not installed the AI schema.
            scalar("SELECT digest_slot FROM ai_runtime_state WHERE id=1");
        }catch(SQLException|RuntimeException failure){
            if(ownsLock)try(var release=acquired.prepareStatement("SELECT RELEASE_LOCK(?)")){
                release.setString(1,acquiredName);release.executeQuery().close();
            }catch(SQLException ignored){}
            if(acquired!=null)try{acquired.close();}catch(SQLException ignored){}
            throw new IllegalStateException("AI DB 저장소 초기화 실패: 마이그레이션·단일 작업자 연결을 확인해주세요.",failure);
        }
    }

    @Override public synchronized Data read(){
        try{ensureOwner();return load(null,null,null);}
        catch(SQLException failure){throw unavailable(failure);}
    }
    @Override public synchronized void change(Consumer<Data> mutation){mutate(null,null,null,mutation);}
    @Override public synchronized void changeMessage(String id,Consumer<Data> mutation){mutate(id,null,null,mutation);}
    @Override public synchronized void changeReport(String author,String key,Consumer<Data> mutation){mutate(null,author,key,mutation);}

    private void mutate(String message,String author,String operation,Consumer<Data> mutation){
        try {
            ensureOwner();connection.setAutoCommit(false);
            try {
                scalar("SELECT digest_slot FROM ai_runtime_state WHERE id=1 FOR UPDATE");
                Data before=load(message,author,operation),after=mapper.convertValue(before,Data.class);
                mutation.accept(after);
                if(after.schema!=1)throw new IllegalArgumentException("AI 저장 형식 오류");
                persist(before,after);connection.commit();
            }catch(SQLException|RuntimeException failure){connection.rollback();throw failure;}
            finally{connection.setAutoCommit(true);}
        }catch(SQLException failure){throw unavailable(failure);}
    }

    private Data load(String extraMessage,String author,String operation)throws SQLException {
        Data data=new Data();data.lastDigestSlot=scalar("SELECT digest_slot FROM ai_runtime_state WHERE id=1");
        var messages=new LinkedHashMap<String,Message>();
        add(messages,rows(Message.class,"SELECT payload FROM ai_chat_messages WHERE processed=FALSE ORDER BY sent_at,sequence_id LIMIT 512"),m->m.chat().id());
        var pending=new ArrayList<>(messages.values());
        add(messages,rows(Message.class,"SELECT payload FROM ai_chat_messages WHERE processed=TRUE ORDER BY sent_at DESC,sequence_id DESC LIMIT 100"),m->m.chat().id());
        if(!pending.isEmpty())add(messages,rows(Message.class,"""
                SELECT ranked.payload FROM (
                  SELECT m.payload, ROW_NUMBER() OVER (PARTITION BY m.scope ORDER BY m.sent_at DESC,m.sequence_id DESC) AS seq
                  FROM ai_chat_messages m JOIN (
                    SELECT scope,MIN(sent_at) AS first_at FROM (
                      SELECT scope,sent_at FROM ai_chat_messages WHERE processed=FALSE ORDER BY sent_at,sequence_id LIMIT 512
                    ) pending GROUP BY scope
                  ) p ON m.scope=p.scope
                  WHERE m.processed=TRUE AND m.sent_at BETWEEN p.first_at-30000 AND p.first_at
                ) ranked WHERE ranked.seq<=5
                """),m->m.chat().id());
        if(extraMessage!=null)add(messages,rows(Message.class,"SELECT payload FROM ai_chat_messages WHERE id=?",extraMessage),m->m.chat().id());
        data.messages=messages.isEmpty()?new ArrayList<>():rows(Message.class,"SELECT payload FROM ai_chat_messages WHERE id IN ("+marks(messages.size())+") ORDER BY sent_at,sequence_id",messages.keySet().toArray());

        var incidents=new LinkedHashMap<String,Incident>();
        add(incidents,rows(Incident.class,"SELECT payload FROM ai_incidents WHERE state='PENDING' ORDER BY next_attempt_at,id LIMIT 128"),Incident::id);
        add(incidents,rows(Incident.class,"SELECT payload FROM ai_incidents ORDER BY created_at DESC,id DESC LIMIT 128"),Incident::id);
        add(incidents,rows(Incident.class,"SELECT payload FROM ai_incidents WHERE state='FAILED' ORDER BY next_attempt_at,id LIMIT 64"),Incident::id);
        if(!pending.isEmpty()){
            var ids=pending.stream().map(m->m.chat().id()).toList();
            add(incidents,rows(Incident.class,"SELECT DISTINCT i.payload FROM ai_incidents i JOIN ai_incident_messages m ON m.incident_id=i.id WHERE m.message_id IN ("+marks(ids.size())+")",ids.toArray()),Incident::id);
        }
        data.incidents=new ArrayList<>(incidents.values());

        var reports=new LinkedHashMap<String,Report>();
        add(reports,rows(Report.class,"SELECT payload FROM ai_feedback_reports WHERE state='PENDING' ORDER BY created_at,id LIMIT 64"),Report::id);
        add(reports,rows(Report.class,"SELECT payload FROM ai_feedback_reports WHERE state='DIGEST_PENDING' ORDER BY created_at,id LIMIT 100"),Report::id);
        add(reports,rows(Report.class,"SELECT payload FROM ai_feedback_reports ORDER BY created_at DESC,id DESC LIMIT 32"),Report::id);
        if(author!=null)add(reports,rows(Report.class,"SELECT payload FROM ai_feedback_reports WHERE author=? AND operation_id=?",author,operation),Report::id);
        data.reports=new ArrayList<>(reports.values());

        var notices=new LinkedHashMap<String,Notice>();
        add(notices,rows(Notice.class,"SELECT payload FROM ai_notice_outbox WHERE state='PENDING' ORDER BY next_attempt_at,id LIMIT 128"),Notice::id);
        add(notices,rows(Notice.class,"SELECT payload FROM ai_notice_outbox WHERE state='FAILED' ORDER BY next_attempt_at,id LIMIT 64"),Notice::id);
        add(notices,rows(Notice.class,"SELECT payload FROM ai_notice_outbox WHERE state='SENT' ORDER BY sent_at DESC,id DESC LIMIT 32"),Notice::id);
        if(!incidents.isEmpty()){
            var keys=incidents.values().stream().map(i->"case:"+i.id()).toList();
            add(notices,rows(Notice.class,"SELECT payload FROM ai_notice_outbox WHERE operation_key IN ("+marks(keys.size())+")",keys.toArray()),Notice::id);
        }
        data.notices=new ArrayList<>(notices.values());
        if(!messages.isEmpty()){
            try(var statement=statement("SELECT message_id,kind,payload FROM ai_chat_assessments WHERE message_id IN ("+marks(messages.size())+")",messages.keySet().toArray());var result=statement.executeQuery()){
                while(result.next()){
                    if(result.getString(2).equals("CONFLICT"))data.conflictAssessments.put(result.getString(1),decode(result.getString(3),AiDecisions.ConflictAssessment.class));
                    else data.assessments.put(result.getString(1),decode(result.getString(3),AiDecisions.Assessment.class));
                }
            }
        }
        return data;
    }

    private void persist(Data before,Data after)throws SQLException {
        changed(before.messages,after.messages,m->m.chat().id(),(m,exists)->writeRow(exists,
                "INSERT INTO ai_chat_messages(id,scope,processed,sent_at,payload) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE processed=VALUES(processed),payload=VALUES(payload)",
                m.chat().id(),m.chat().scope(),m.processed(),m.chat().sentAt(),encode(m)));
        changed(before.reports,after.reports,Report::id,(r,exists)->writeRow(exists,
                "INSERT INTO ai_feedback_reports(id,author,operation_id,state,created_at,payload) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),payload=VALUES(payload)",
                r.id(),r.author(),r.operationId(),r.triage()==null?"PENDING":r.triage().severity()>=2&&r.digestId().isEmpty()?"DIGEST_PENDING":"DONE",r.createdAt(),encode(r)));
        changed(before.incidents,after.incidents,Incident::id,(i,exists)->{
            writeRow(exists,"INSERT INTO ai_incidents(id,scope,state,next_attempt_at,created_at,payload) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),next_attempt_at=VALUES(next_attempt_at),payload=VALUES(payload)",
                    i.id(),i.scope(),i.policeStatus(),i.policeNextAttemptAt(),i.createdAt(),encode(i));
            for(String message:i.messageIds())execute("INSERT INTO ai_incident_messages(incident_id,message_id) VALUES(?,?) ON DUPLICATE KEY UPDATE incident_id=VALUES(incident_id)",i.id(),message);
        });
        changed(before.notices,after.notices,Notice::id,(n,exists)->writeRow(exists,
                "INSERT INTO ai_notice_outbox(id,operation_key,state,next_attempt_at,sent_at,payload) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),next_attempt_at=VALUES(next_attempt_at),sent_at=VALUES(sent_at),payload=VALUES(payload)",
                n.id(),n.key(),n.status(),n.nextAttemptAt(),n.sentAt(),encode(n)));
        changedMap(before.assessments,after.assessments,"MODERATION");
        changedMap(before.conflictAssessments,after.conflictAssessments,"CONFLICT");
        if(!Objects.equals(before.lastDigestSlot,after.lastDigestSlot))execute("UPDATE ai_runtime_state SET digest_slot=? WHERE id=1",after.lastDigestSlot);
    }

    @Override public synchronized Incident incident(String id){
        try{ensureOwner();return rows(Incident.class,"SELECT payload FROM ai_incidents WHERE id=?",id).stream().findFirst().orElseThrow();}
        catch(SQLException failure){throw unavailable(failure);}
    }
    @Override public synchronized List<Message> messages(List<String> ids){
        if(ids.isEmpty())return List.of();
        try{ensureOwner();return rows(Message.class,"SELECT payload FROM ai_chat_messages WHERE id IN ("+marks(ids.size())+") ORDER BY sent_at,sequence_id",ids.toArray());}
        catch(SQLException failure){throw unavailable(failure);}
    }
    @Override public synchronized void retryFailures(long now){
        try{
            ensureOwner();connection.setAutoCommit(false);
            try{
                execute("UPDATE ai_notice_outbox SET state='PENDING',next_attempt_at=?,sent_at=0,payload=JSON_SET(payload,'$.status','PENDING','$.attempts',0,'$.nextAttemptAt',?,'$.sentAt',0) WHERE state<>'SENT'",now,now);
                execute("UPDATE ai_incidents SET state='PENDING',next_attempt_at=?,payload=JSON_SET(payload,'$.policeStatus','PENDING','$.policeAttempts',0,'$.policeNextAttemptAt',?) WHERE state='FAILED'",now,now);
                connection.commit();
            }catch(SQLException failure){connection.rollback();throw failure;}
            finally{connection.setAutoCommit(true);}
        }catch(SQLException failure){throw unavailable(failure);}
    }

    private <T> void changed(List<T> before,List<T> after,Function<T,String> key,SqlConsumer<T> write)throws SQLException {
        var previous=new HashMap<String,T>();before.forEach(v->previous.put(key.apply(v),v));
        var remaining=new HashSet<>(previous.keySet());
        for(T item:after){String id=key.apply(item);remaining.remove(id);if(!Objects.equals(previous.get(id),item))write.accept(item,previous.containsKey(id));}
        if(!remaining.isEmpty())throw new IllegalArgumentException("AI 기록의 묵시적 삭제는 허용하지 않습니다.");
    }
    private void changedMap(Map<String,?> before,Map<String,?> after,String kind)throws SQLException {
        for(var entry:after.entrySet())if(!Objects.equals(before.get(entry.getKey()),entry.getValue()))execute(
                "INSERT INTO ai_chat_assessments(message_id,kind,payload) VALUES(?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)",entry.getKey(),kind,encode(entry.getValue()));
    }
    private void ensureOwner()throws SQLException {
        if(closed||!"1".equals(scalar("SELECT IS_USED_LOCK(?) = CONNECTION_ID()",ownerLock)))throw new SQLException("AI worker ownership lost");
    }
    private static String marks(int count){return String.join(",",Collections.nCopies(count,"?"));}
    private static <T> void add(Map<String,T> target,List<T> rows,Function<T,String> key){rows.forEach(row->target.put(key.apply(row),row));}
    private PreparedStatement statement(String sql,Object... values)throws SQLException {
        var statement=connection.prepareStatement(sql);
        for(int i=0;i<values.length;i++)statement.setObject(i+1,values[i]);return statement;
    }
    private String scalar(String sql,Object... values)throws SQLException {
        try(var statement=statement(sql,values);var result=statement.executeQuery()){if(!result.next())throw new SQLException("AI state row missing");return result.getString(1);}
    }
    private void execute(String sql,Object... values)throws SQLException {try(var statement=statement(sql,values)){statement.executeUpdate();}}
    private void writeRow(boolean exists,String upsert,Object... values)throws SQLException {
        // A new logical key must never overwrite another record through a unique-key collision.
        execute(exists?upsert:upsert.substring(0,upsert.indexOf(" ON DUPLICATE KEY UPDATE")),values);
    }
    private <T> List<T> rows(Class<T> type,String sql,Object... values)throws SQLException {
        var rows=new ArrayList<T>();try(var statement=statement(sql,values);var result=statement.executeQuery()){while(result.next())rows.add(decode(result.getString(1),type));}return rows;
    }
    private <T> T decode(String json,Class<T> type){try{return mapper.readValue(json,type);}catch(IOException failure){throw new IllegalStateException("AI DB 기록 형식 오류",failure);}}
    private String encode(Object value){try{return mapper.writeValueAsString(value);}catch(IOException failure){throw new IllegalStateException("AI DB 기록 직렬화 실패",failure);}}
    private IllegalStateException unavailable(SQLException failure){return new IllegalStateException("AI DB 저장 실패: 작업을 보존하고 재시도합니다.",failure);}
    @Override public synchronized void close()throws IOException {
        if(closed)return;closed=true;
        try{try{scalar("SELECT RELEASE_LOCK(?)",ownerLock);}finally{connection.close();}}
        catch(SQLException failure){throw new IOException("AI DB 연결 종료 실패",failure);}
    }
    @FunctionalInterface private interface SqlConsumer<T>{void accept(T value,boolean exists)throws SQLException;}
}
