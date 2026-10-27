package com.ssafy.ontop.admin.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 앱 DB나 원본 행동 로그에 접근하지 않고 게시된 집계 파일만 읽는다. */
@Component
public class AnalyticsSnapshotStore {
    private static final long MAX_BYTES = 1_048_576;
    private final ObjectMapper json;
    private final String snapshotPath;

    public AnalyticsSnapshotStore(ObjectMapper json, @Value("${ontop.analytics.snapshot-path:}") String snapshotPath) {
        this.json = json;
        this.snapshotPath = snapshotPath;
    }

    public AnalyticsSnapshot read() {
        if (snapshotPath == null || snapshotPath.isBlank()) throw new SnapshotUnavailableException();
        try {
            Path path = Path.of(snapshotPath);
            if (!Files.isRegularFile(path) || Files.size(path) > MAX_BYTES) throw new SnapshotUnavailableException();
            byte[] bytes = Files.readAllBytes(path);
            if (bytes.length > MAX_BYTES) throw new SnapshotUnavailableException();
            return json.readValue(bytes, AnalyticsSnapshot.class);
        } catch (IOException | RuntimeException error) {
            throw new SnapshotUnavailableException();
        }
    }

    public static final class SnapshotUnavailableException extends RuntimeException {
        public SnapshotUnavailableException() { super("집계 파일을 사용할 수 없습니다."); }
    }
}
