package com.ssafy.ontop.ai;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import static org.assertj.core.api.Assertions.*;
class JokeMigrationLayoutTests {
 @Test void 적용된_로컬_V166_원문은_바이트를_보존하고_공용_검색경로에서_제외한다()throws Exception{
  var loader=getClass().getClassLoader();assertThat(loader.getResource("db/migration/V166__create_joke_contest.sql")).isNull();
  byte[] legacy=loader.getResourceAsStream("db/ai-legacy/V166__create_joke_contest.sql").readAllBytes();
  assertThat(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(new String(legacy,StandardCharsets.UTF_8).replace("\r\n","\n").getBytes(StandardCharsets.UTF_8)))).isEqualTo("2ff2be6ff125bf134a3b97a69ca48f08d4f9560e15f5a8e3c5b5baeea9346975");
  String candidate=new String(loader.getResourceAsStream("db/migration/V170__create_joke_contest.sql").readAllBytes(),StandardCharsets.UTF_8);
  assertThat(candidate.substring(candidate.indexOf("CREATE TABLE")).replace("\r\n","\n")).isEqualTo(new String(legacy,StandardCharsets.UTF_8).substring(new String(legacy,StandardCharsets.UTF_8).indexOf("CREATE TABLE")).replace("\r\n","\n"));
 }
 @Test void 실제_공용_검색경로에_중복버전이_없고_아재왕170의_역할이_맞다()throws Exception{
  var resolver=new PathMatchingResourcePatternResolver();var versions=new TreeMap<Integer,String>();
  for(String root:List.of("migration","minigame","shop"))for(var resource:resolver.getResources("classpath*:db/"+root+"/V*__*.sql")){
   String name=resource.getFilename();int version=Integer.parseInt(name.substring(1,name.indexOf("__")));assertThat(versions.putIfAbsent(version,name)).as(name).isNull();
  }
  assertThat(versions.get(166)).isEqualTo("V166__add_mole_ranking_index.sql");if(versions.containsKey(168))assertThat(versions.get(168)).isEqualTo("V168__create_entry_news.sql");if(versions.containsKey(169))assertThat(versions.get(169)).isEqualTo("V169__add_entry_news_image_key.sql");assertThat(versions.get(170)).isEqualTo("V170__create_joke_contest.sql");
 }
}
