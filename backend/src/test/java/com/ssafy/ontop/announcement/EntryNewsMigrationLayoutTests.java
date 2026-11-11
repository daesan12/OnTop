package com.ssafy.ontop.announcement;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class EntryNewsMigrationLayoutTests {
 String sql(String name)throws Exception{try(var stream=getClass().getClassLoader().getResourceAsStream(name)){assertThat(stream).as(name).isNotNull();return new String(stream.readAllBytes(),StandardCharsets.UTF_8).replace("\r\n","\n");}}
 @Test void 팀원167을_피하고_공지168과169의_DDL은_그대로_보존한다()throws Exception{
  var loader=getClass().getClassLoader();assertThat(loader.getResource("db/migration/V167__create_entry_news.sql")).isNull();assertThat(loader.getResource("db/migration/V168__add_entry_news_image_key.sql")).isNull();
  String before=sql("db/entry-news-legacy/V167__create_entry_news.sql"),after=sql("db/migration/V168__create_entry_news.sql");assertThat(after.substring(after.indexOf("CREATE TABLE"))).isEqualTo(before.substring(before.indexOf("CREATE TABLE")));
  before=sql("db/entry-news-legacy/V168__add_entry_news_image_key.sql");after=sql("db/migration/V169__add_entry_news_image_key.sql");assertThat(after.substring(after.indexOf("ALTER TABLE"))).isEqualTo(before.substring(before.indexOf("ALTER TABLE")));
 }
}
