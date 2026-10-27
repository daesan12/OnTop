package com.ssafy.ontop.admin.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AnalyticsSnapshotStoreTests {
    @TempDir
    Path folder;

    @Test
    void 집계_파일이_없거나_손상되면_사용할_수_없다() throws Exception {
        Path file = folder.resolve("summary.json");
        var store = new AnalyticsSnapshotStore(new ObjectMapper(), file.toString());
        assertThatThrownBy(store::read).isInstanceOf(AnalyticsSnapshotStore.SnapshotUnavailableException.class);

        Files.writeString(file, "{\"schemaVersion\":1,\"dataAsOf\":\"bad\",\"generatedAt\":\"bad\",\"daily\":[],\"funnel\":[],\"games\":[]}");
        assertThatThrownBy(store::read).isInstanceOf(AnalyticsSnapshotStore.SnapshotUnavailableException.class);
    }

    @Test
    void 집계_파일에서_허용된_숫자만_읽는다() throws Exception {
        Path file = folder.resolve("summary.json");
        Files.writeString(file, "{\"schemaVersion\":1,\"dataAsOf\":\"2026-10-27T00:00:00Z\","
                + "\"generatedAt\":\"2026-10-27T01:00:00Z\",\"daily\":[{\"date\":\"2026-10-27\","
                + "\"activeUsers\":3,\"newUsers\":1,\"connections\":4,\"players\":2}],"
                + "\"funnel\":[],\"games\":[]}");
        var summary = new AnalyticsSnapshotStore(new ObjectMapper(), file.toString()).read();
        assertThat(summary.daily()).hasSize(1);
        assertThat(summary.daily().getFirst().activeUsers()).isEqualTo(3);
    }
}
