package com.ssafy.ontop.game.skewer.coop.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;

/** DB 장애 중 결과 인계용 영속 저널. 서버마다 고정된 전용 영속 디렉터리를 사용한다. */
public final class SkewerCoopResultJournal implements AutoCloseable {
    private final Path directory;
    private final ObjectMapper mapper;
    private final FileChannel lockChannel;
    private final FileLock lock;

    public SkewerCoopResultJournal(Path directory, ObjectMapper mapper) throws IOException {
        if (!directory.isAbsolute() || directory.toString().isBlank()) {
            throw new IllegalArgumentException("정산 저널은 영속 디스크의 절대 경로로 지정하세요.");
        }
        this.directory = directory.toAbsolutePath().normalize();
        this.mapper = mapper;
        Files.createDirectories(this.directory);
        lockChannel = FileChannel.open(this.directory.resolve("journal.lock"),
                StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        FileLock acquired;
        try {
            acquired = lockChannel.tryLock();
            if (acquired == null) {
                throw new IOException("다른 서버가 꼬치왕 정산 저널을 사용 중입니다.");
            }
        } catch (IOException | RuntimeException exception) {
            lockChannel.close();
            throw exception;
        }
        lock = acquired;
    }

    public synchronized List<SkewerCoopFinished> load() {
        try (var files = Files.list(directory)) {
            List<SkewerCoopFinished> results = new ArrayList<>();
            for (Path file : files.filter(path -> path.getFileName().toString().endsWith(".json")).sorted().toList()) {
                SkewerCoopFinished result = mapper.readValue(file.toFile(), SkewerCoopFinished.class);
                if (!file.equals(path(result.result().gameId()))) {
                    throw new IOException("정산 저널의 경기 번호가 파일명과 다릅니다.");
                }
                results.add(result);
            }
            return results;
        } catch (IOException exception) {
            // 손상된 파일을 건너뛰어 미지급을 숨기지 않는다. 원본을 보존하고 기동을 중단한다.
            throw new UncheckedIOException("꼬치왕 정산 저널을 복구할 수 없습니다.", exception);
        }
    }

    public synchronized void append(SkewerCoopFinished result) {
        Path target = path(result.result().gameId());
        try {
            if (Files.exists(target)) {
                if (!mapper.readValue(target.toFile(), SkewerCoopFinished.class).equals(result)) {
                    throw new IllegalStateException("같은 경기의 정산 저널 내용이 다릅니다.");
                }
                return;
            }
            Path temporary = directory.resolve(result.result().gameId() + ".tmp");
            try (FileChannel file = FileChannel.open(temporary, StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                ByteBuffer bytes = ByteBuffer.wrap(mapper.writeValueAsBytes(result));
                while (bytes.hasRemaining()) {
                    file.write(bytes);
                }
                file.force(true);
            }
            // 원자적 이동을 지원하지 않는 저장소에서는 저장 성공으로 처리하지 않는다.
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException exception) {
            throw new UncheckedIOException("꼬치왕 정산 결과를 영속 디스크에 기록하지 못했습니다.", exception);
        }
    }

    public synchronized void acknowledged(String gameId) {
        try {
            Files.deleteIfExists(path(gameId));
        } catch (IOException exception) {
            // DB 커밋 뒤 삭제 실패는 다음 기동 시 같은 결과를 재전달한다. DB 멱등성으로 중복 지급을 막는다.
            throw new UncheckedIOException("확정한 꼬치왕 정산 저널 정리에 실패했습니다.", exception);
        }
    }

    private Path path(String gameId) {
        if (gameId == null || !gameId.matches("skewer-coop-[a-f0-9-]{36}")) {
            throw new IllegalArgumentException("정산 저널 경기 번호를 확인하세요.");
        }
        return directory.resolve(gameId + ".json");
    }

    @Override
    public void close() throws IOException {
        try {
            lock.release();
        } finally {
            lockChannel.close();
        }
    }
}
