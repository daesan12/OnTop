package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Local-only single writer. Never used for shared databases or deployed profiles. */
public final class LocalAiStore implements AutoCloseable {
    public record Message(AiDecisions.Chat chat, boolean hidden, long version, boolean processed) { }
    public record Report(String id, String operationId, String author, String text, long createdAt,
                         AiDecisions.Triage triage, String digestId) { }
    public record Notice(String id, String key, String kind, String text, String status, int attempts,
                         long nextAttemptAt, long sentAt,Double modelScore) {
        public Notice(String id,String key,String kind,String text,String status,int attempts,long nextAttemptAt,long sentAt){this(id,key,kind,text,status,attempts,nextAttemptAt,sentAt,null);}
    }
    public record Incident(String id, String scope, String kind, List<String> messageIds, long createdAt, String provider,
                           List<String> actors, double x, double z, String policeStatus, int policeAttempts, long policeNextAttemptAt) {
        public Incident {
            messageIds=List.copyOf(messageIds);
            actors=actors==null?List.of():List.copyOf(actors);
            // Older saved incidents must not be dispatched again merely because the schema gained fields.
            policeStatus=policeStatus==null?"LEGACY":policeStatus;
        }
    }
    public static final class Data {
        public int schema = 1;
        public List<Message> messages = new ArrayList<>();
        public List<Report> reports = new ArrayList<>();
        public List<Notice> notices = new ArrayList<>();
        public List<Incident> incidents = new ArrayList<>();
        public java.util.Map<String,AiDecisions.Assessment> assessments=new java.util.LinkedHashMap<>();
        public java.util.Map<String,AiDecisions.ConflictAssessment> conflictAssessments=new java.util.LinkedHashMap<>();
        public String lastDigestSlot = "";
    }
    private final ObjectMapper mapper;
    private final Path file;
    private final FileChannel lockChannel;
    private final FileLock lock;
    private Data data;

    public LocalAiStore(Path directory, ObjectMapper mapper) throws IOException {
        this.mapper = mapper;
        Files.createDirectories(directory);
        file = directory.resolve("state.json");
        lockChannel = FileChannel.open(directory.resolve("writer.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        FileLock acquired;
        try { acquired = lockChannel.tryLock(); }
        catch (RuntimeException exception) { lockChannel.close(); throw exception; }
        if (acquired == null) { lockChannel.close(); throw new IOException("로컬 AI 저장소가 이미 사용 중입니다."); }
        lock = acquired;
        try {
            if (Files.exists(file) && Files.size(file) > 16 * 1024 * 1024) throw new IOException("로컬 저장소 크기 제한 초과");
            data = Files.exists(file) ? mapper.readValue(file.toFile(), Data.class) : new Data();
            if (data.schema != 1) throw new IOException("지원하지 않는 로컬 저장소 버전");
        } catch (IOException | RuntimeException exception) { close(); throw exception; }
    }
    public synchronized Data read() { return mapper.convertValue(data, Data.class); }
    public synchronized void change(Consumer<Data> mutation) {
        Data next = read();
        mutation.accept(next);
        if (next.messages.size() > 5000 || next.assessments.size()>5000 || next.conflictAssessments.size()>5000 || next.reports.size() > 2000 || next.notices.size() > 4000 || next.incidents.size() > 2000)
            throw new IllegalStateException("로컬 저장 한도입니다. 별도 새 데이터 디렉터리로 실행해주세요.");
        Path temporary = file.resolveSibling("state.next.json");
        try {
            byte[] bytes = mapper.writeValueAsBytes(next);
            if (bytes.length > 16 * 1024 * 1024) throw new IOException("로컬 저장소 크기 제한 초과");
            try (var channel = FileChannel.open(temporary, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                var buffer = java.nio.ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            for(int attempt=0;;attempt++) {
                try {
                    Files.move(temporary,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
                    break;
                } catch(java.nio.file.AccessDeniedException busy) {
                    // Windows may briefly deny the atomic replacement; never fall back to a partial copy.
                    if(attempt>=3) throw busy;
                    try { Thread.sleep(10L<<attempt); }
                    catch(InterruptedException interrupted) {
                        Thread.currentThread().interrupt(); throw new IOException("로컬 저장 재시도 중단",interrupted);
                    }
                }
            }
            data = next;
        } catch (IOException exception) { throw new IllegalStateException("로컬 저장에 실패했습니다. 요청을 재시도해주세요.", exception); }
    }
    @Override public void close() throws IOException { lock.release(); lockChannel.close(); }
}
