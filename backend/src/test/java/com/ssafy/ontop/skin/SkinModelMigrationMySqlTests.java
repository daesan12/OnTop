package com.ssafy.ontop.skin;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
class SkinModelMigrationMySqlTests {
    @Test void v161_uploads_keep_their_file_and_gain_character_links() throws Exception {
        String base=System.getenv("TEST_SKIN_DB_URL");
        if(base==null||!base.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_skin_test_[A-Za-z0-9_]+(?:\\?.*)?"))
            throw new IllegalStateException("스킨 전용 loopback 검증 DB가 필요합니다.");
        String database="ontop_skin_test_legacy_"+UUID.randomUUID().toString().replace("-","");
        String password=System.getenv().getOrDefault("TEST_SKIN_DB_PASSWORD","");
        try(var connection=DriverManager.getConnection(base,"root",password);var statement=connection.createStatement()) {
            statement.execute("CREATE DATABASE "+database+" CHARACTER SET utf8mb4");
        }
        String url=base.replaceFirst("/ontop_skin_test_[A-Za-z0-9_]+", "/"+database);
        Flyway.configure().dataSource(url,"root",password).locations("classpath:db/migration","classpath:db/minigame","classpath:db/shop")
                .target("161").load().migrate();
        try(var connection=DriverManager.getConnection(url,"root",password);var statement=connection.createStatement()) {
            for(String gender:new String[]{"MALE","FEMALE","ANY"}) {
                String skin=UUID.randomUUID().toString(),upload=UUID.randomUUID().toString();
                statement.executeUpdate("INSERT INTO skin_catalog(id,product_code,name,grade,compatibility,wear_mode,slots) VALUES('"+skin+"','LEGACY_"+gender+"','기존 모자',4,'"+gender+"','PARTS','HAIR')");
                statement.executeUpdate("INSERT INTO skin_uploads(id,skin_id,catalog_version,model_bytes,image_bytes,model_sha256,image_sha256,object_prefix,expires_at) VALUES('"+upload+"','"+skin+"',0,20,12,'"+"a".repeat(64)+"','"+"b".repeat(64)+"','legacy/"+upload+"',CURRENT_TIMESTAMP(3))");
            }
        }
        Flyway.configure().dataSource(url,"root",password).locations("classpath:db/migration","classpath:db/minigame","classpath:db/shop").load().migrate();
        try(var connection=DriverManager.getConnection(url,"root",password);var statement=connection.createStatement()) {
            try(var result=statement.executeQuery("SELECT COUNT(*) FROM skin_models m JOIN skin_uploads u ON u.id=m.upload_id WHERE m.id=u.id AND m.model_sha256=u.model_sha256 AND m.model_bytes=u.model_bytes AND m.file_name='model.glb'")) {
                result.next();assertThat(result.getInt(1)).isEqualTo(3);
            }
            try(var result=statement.executeQuery("SELECT c.compatibility,COUNT(l.model_id),COUNT(DISTINCT l.model_id) FROM skin_catalog c JOIN skin_uploads u ON u.skin_id=c.id JOIN skin_upload_models l ON l.upload_id=u.id GROUP BY c.compatibility ORDER BY c.compatibility")) {
                result.next();assertThat(result.getString(1)).isEqualTo("ANY");assertThat(result.getInt(2)).isEqualTo(2);assertThat(result.getInt(3)).isEqualTo(1);
                result.next();assertThat(result.getString(1)).isEqualTo("FEMALE");assertThat(result.getInt(2)).isEqualTo(1);
                result.next();assertThat(result.getString(1)).isEqualTo("MALE");assertThat(result.getInt(2)).isEqualTo(1);
            }
        }
    }
}
