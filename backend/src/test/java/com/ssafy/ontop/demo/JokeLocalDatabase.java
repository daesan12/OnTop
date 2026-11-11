package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.ai.JdbcJokeContestStore;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;

/** Explicit local fixture only. Never reads DB_URL or accepts shared hosts/database names. */
public final class JokeLocalDatabase {
    private JokeLocalDatabase(){ }
    public static HikariDataSource open(Map<String,String> env){
        String url=env.getOrDefault("AI_LAB_JOKE_DB_URL","");
        if(!url.matches("jdbc:mysql://127\\.0\\.0\\.1:19306/ontop_joke_local_[a-z0-9_]+(?:\\?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8)?"))throw new IllegalArgumentException("아재왕 전용 loopback DB만 허용합니다.");
        var config=new HikariConfig();config.setJdbcUrl(url);config.setUsername(env.get("AI_LAB_JOKE_DB_USERNAME"));config.setPassword(env.get("AI_LAB_JOKE_DB_PASSWORD"));config.setMaximumPoolSize(5);config.setMinimumIdle(1);config.setConnectionInitSql("SET time_zone = '+00:00'");config.setPoolName("joke-local");
        var source=new HikariDataSource(config);
        try{rejectHistoricalAiVersion(source);Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/minigame","classpath:db/shop").validateMigrationNaming(true).baselineOnMigrate(false).load().migrate();return source;}catch(RuntimeException e){source.close();throw e;}
    }
    /** Historical AI V166 databases remain untouched; new shared V166 belongs to mole ranking. */
    private static void rejectHistoricalAiVersion(HikariDataSource source){
        var jdbc=new JdbcTemplate(source);
        int exists=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='flyway_schema_history'",Integer.class);
        boolean historical=exists>0&&jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE (version='166' AND script='V166__create_joke_contest.sql') OR (version='167' AND script='V167__create_entry_news.sql') OR (version='168' AND script='V168__add_entry_news_image_key.sql') OR (version='169' AND script='V169__create_joke_contest.sql')",Integer.class)>0;
        boolean current=exists>0&&jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='170' AND script='V170__create_joke_contest.sql' AND success=1",Integer.class)>0;
        int tables=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('joke_contest_daily_quotas','joke_contest_submissions','joke_contest_daily_winners')",Integer.class);
        if(historical||tables>0&&!current)
            throw new IllegalStateException("기존/부분 적용 아재왕 로컬 DB를 보존했습니다. repair/번호 변경 없이 새 ontop_joke_local_* DB로 V170을 검증해주세요. 이전 기록은 자동 이관하지 않습니다.");
    }
    public static JdbcJokeContestStore fixtureStore(ObjectMapper mapper){
        var source=open(System.getenv());
        try{var jdbc=new JdbcTemplate(source);for(var entry:Map.of(101L,"홍팀 로컬",202L,"청팀 로컬",505L,"관전 로컬").entrySet())jdbc.update("INSERT IGNORE INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES(?,'NAVER',?,?,'MALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",entry.getKey(),"joke-local-"+entry.getKey(),entry.getValue());
            return new JdbcJokeContestStore(source,mapper,source::close);
        }catch(RuntimeException e){source.close();throw e;}
    }
}
