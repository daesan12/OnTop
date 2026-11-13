package com.ssafy.ontop.ai;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class AiDatabaseMigrationLayoutTests {
    @Test void orderedSharedMigrationsHaveUniqueVersionsAndOnlyAddAiTables()throws Exception {
        Path root=Path.of("src/main/resources/db");var versions=new HashMap<String,Path>();
        try(var paths=Files.walk(root)){
            for(Path path:paths.filter(p->p.getFileName().toString().matches("V[0-9]+__.*\\.sql")).toList()){
                String version=path.getFileName().toString().split("__")[0];
                assertThat(versions.put(version,path)).as("duplicate Flyway version %s",version).isNull();
            }
        }
        assertThat(versions).containsKeys("V167","V168","V169","V170","V171");
        assertThat(Files.readString(versions.get("V170"))).contains("CREATE TABLE joke_contest_submissions");
        String ai=Files.readString(versions.get("V171"));
        assertThat(ai).contains("CREATE TABLE ai_chat_messages","CREATE TABLE ai_notice_outbox","CREATE TABLE ai_runtime_state");
        assertThat(ai.toUpperCase(Locale.ROOT)).doesNotContain("DROP TABLE","ALTER TABLE","DELETE FROM");
    }
}
