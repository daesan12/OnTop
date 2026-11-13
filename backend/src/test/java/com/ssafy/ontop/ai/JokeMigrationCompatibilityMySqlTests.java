package com.ssafy.ontop.ai;
import com.ssafy.ontop.demo.JokeLocalDatabase;
import com.zaxxer.hikari.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;
@Tag("mysql")
class JokeMigrationCompatibilityMySqlTests {
 @org.junit.jupiter.api.io.TempDir java.nio.file.Path legacyScripts;
 Map<String,String> settings(String variable){var env=new HashMap<>(System.getenv());String url=env.get(variable);if(url==null||!url.matches("jdbc:mysql://127\\.0\\.0\\.1:19306/ontop_joke_local_test_[a-z0-9_]+(?:\\?.*)?"))throw new IllegalStateException("새 격리 검증 DB가 필요합니다.");env.put("AI_LAB_JOKE_DB_URL",url);return env;}
 HikariDataSource raw(Map<String,String> env){var c=new HikariConfig();c.setJdbcUrl(env.get("AI_LAB_JOKE_DB_URL"));c.setUsername(env.get("AI_LAB_JOKE_DB_USERNAME"));c.setPassword(env.get("AI_LAB_JOKE_DB_PASSWORD"));c.setMaximumPoolSize(2);return new HikariDataSource(c);}
 @Test void 두더지166과_선택공지_아재왕170를_한_이력에_순서대로_적용한다(){
  try(var source=JokeLocalDatabase.open(settings("AI_LAB_JOKE_DB_URL"))){var jdbc=new JdbcTemplate(source);assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE version IN ('166','168','169','170') ORDER BY installed_rank",String.class)).containsExactlyElementsOf(getClass().getClassLoader().getResource("db/migration/V168__create_entry_news.sql")==null?List.of("166","170"):List.of("166","168","169","170"));assertThat(jdbc.queryForObject("SELECT script FROM flyway_schema_history WHERE version='166'",String.class)).isEqualTo("V166__add_mole_ranking_index.sql");if(getClass().getClassLoader().getResource("db/migration/V168__create_entry_news.sql")!=null)assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='entry_news' AND column_name='image_key'",Integer.class)).isEqualTo(1);}
 }
 @Test void 이전_AI166_DB는_이력과_데이터를_바꾸지_않고_차단한다()throws Exception{
  var env=settings("AI_LAB_JOKE_LEGACY_DB_URL");try(var source=raw(env)){
   var resolver=new org.springframework.core.io.support.PathMatchingResourcePatternResolver();
   for(String root:List.of("migration","minigame","shop"))for(var resource:resolver.getResources("classpath*:db/"+root+"/V*__*.sql")){String name=resource.getFilename();if(Integer.parseInt(name.substring(1,name.indexOf("__")))<=165)try(var input=resource.getInputStream()){java.nio.file.Files.copy(input,legacyScripts.resolve(name));}}
   try(var input=getClass().getClassLoader().getResourceAsStream("db/ai-legacy/V166__create_joke_contest.sql")){java.nio.file.Files.copy(input,legacyScripts.resolve("V166__create_joke_contest.sql"));}
   Flyway.configure().dataSource(source).locations("filesystem:"+legacyScripts).load().migrate();
   var jdbc=new JdbcTemplate(source);jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES(99001,'NAVER','preserved-legacy','legacy','MALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");jdbc.update("INSERT INTO joke_contest_daily_quotas(user_id,contest_date,used_attempts) VALUES(99001,'2026-11-09',2)");
   var before=jdbc.queryForList("SELECT version,script,checksum,success FROM flyway_schema_history ORDER BY installed_rank");
   assertThatThrownBy(()->JokeLocalDatabase.open(env)).isInstanceOf(IllegalStateException.class).hasMessageContaining("보존");
   assertThat(jdbc.queryForList("SELECT version,script,checksum,success FROM flyway_schema_history ORDER BY installed_rank")).isEqualTo(before);assertThat(jdbc.queryForObject("SELECT used_attempts FROM joke_contest_daily_quotas WHERE user_id=99001",Integer.class)).isEqualTo(2);
  }
 }
 @Test void 이전_공지167과168_AI169_DB도_이력과_자료를_보존한다()throws Exception{
  var env=settings("AI_LAB_JOKE_PREVIOUS_DB_URL");try(var source=raw(env)){
   var resolver=new org.springframework.core.io.support.PathMatchingResourcePatternResolver();
   for(String root:List.of("migration","minigame","shop"))for(var resource:resolver.getResources("classpath*:db/"+root+"/V*__*.sql")){String name=resource.getFilename();if(Integer.parseInt(name.substring(1,name.indexOf("__")))<=166)try(var input=resource.getInputStream()){java.nio.file.Files.copy(input,legacyScripts.resolve(name));}}
   for(String name:List.of("V167__create_entry_news.sql","V168__add_entry_news_image_key.sql","V169__create_joke_contest.sql"))try(var input=getClass().getClassLoader().getResourceAsStream("db/ai-legacy/previous-v167-v169/"+name)){java.nio.file.Files.copy(input,legacyScripts.resolve(name));}
   Flyway.configure().dataSource(source).locations("filesystem:"+legacyScripts).load().migrate();
   var jdbc=new JdbcTemplate(source);var before=jdbc.queryForList("SELECT version,script,checksum,success FROM flyway_schema_history ORDER BY installed_rank");
   jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES(99001,'NAVER','preserved-v169','legacy','MALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");jdbc.update("INSERT INTO joke_contest_daily_quotas(user_id,contest_date,used_attempts) VALUES(99001,'2026-11-09',2)");
   assertThatThrownBy(()->JokeLocalDatabase.open(env)).isInstanceOf(IllegalStateException.class).hasMessageContaining("보존");
   assertThat(jdbc.queryForList("SELECT version,script,checksum,success FROM flyway_schema_history ORDER BY installed_rank")).isEqualTo(before);assertThat(jdbc.queryForObject("SELECT used_attempts FROM joke_contest_daily_quotas WHERE user_id=99001",Integer.class)).isEqualTo(2);
  }
 }
 @Test void 이력없이_일부만_생성된_DB도_DDL_수행_전에_차단한다(){
  var env=settings("AI_LAB_JOKE_PARTIAL_DB_URL");try(var source=raw(env)){var jdbc=new JdbcTemplate(source);jdbc.execute("CREATE TABLE joke_contest_daily_quotas(marker INT)");jdbc.update("INSERT INTO joke_contest_daily_quotas VALUES(19)");assertThatThrownBy(()->JokeLocalDatabase.open(env)).isInstanceOf(IllegalStateException.class).hasMessageContaining("부분");assertThat(jdbc.queryForObject("SELECT marker FROM joke_contest_daily_quotas",Integer.class)).isEqualTo(19);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='flyway_schema_history'",Integer.class)).isZero();}
 }
}
