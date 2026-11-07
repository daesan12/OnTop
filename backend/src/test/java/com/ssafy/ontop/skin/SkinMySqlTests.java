package com.ssafy.ontop.skin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.skin.SkinDtos.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

@Tag("mysql")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "spring.profiles.active=dev,db","ontop.skin.enabled=true","ontop.shop.enabled=true","ontop.gacha.enabled=true","ontop.gacha.broadcast-enabled=false",
        "ontop.admin.read-ids=9401,9402","ontop.admin.operation-ids=9401,9402","SKIN_ADMIN_USER_IDS=9401",
        "spring.jpa.hibernate.ddl-auto=validate","ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
@Import(SkinMySqlTests.StorageConfig.class)
class SkinMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired FakeStorage storage;
    @Autowired SkinService service;
    @Autowired com.ssafy.ontop.gacha.GachaService gacha;
    @Autowired com.ssafy.ontop.shop.service.ShopService shop;
    @LocalServerPort int port;
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    final HttpClient http=HttpClient.newHttpClient();
    byte[] model,image;
    String admin,other;
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        String url=System.getenv("TEST_SKIN_DB_URL");
        if(url==null||!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_skin_test_[A-Za-z0-9_]+(?:\\?.*)?")) throw new IllegalStateException("스킨 전용 loopback 검증 DB가 필요합니다.");
        r.add("spring.datasource.url",()->url);r.add("spring.datasource.username",()->"root");
        r.add("spring.datasource.password",()->System.getenv().getOrDefault("TEST_SKIN_DB_PASSWORD",""));
        r.add("spring.flyway.locations",()->"classpath:db/migration,classpath:db/minigame,classpath:db/shop");
    }
    @BeforeEach void setup() throws Exception {
        jdbc.update("DELETE ui FROM user_items ui JOIN items i ON i.id=ui.item_id WHERE i.item_code LIKE 'SK_REGTEST_%'");
        jdbc.update("DELETE FROM gacha_receipts WHERE user_id=9402");
        jdbc.update("DELETE FROM wallet_transactions WHERE idempotency_key LIKE 'gacha:9402:%'");
        jdbc.update("DELETE FROM gacha_inventory WHERE user_id=9402");
        jdbc.update("DELETE FROM gacha_product_items WHERE product_code LIKE 'REGTEST_%'");
        jdbc.update("DELETE FROM gacha_products WHERE product_code LIKE 'REGTEST_%'");
        jdbc.update("DELETE FROM items WHERE item_code LIKE 'SK_REGTEST_%'");
        jdbc.update("DELETE FROM skin_uploads");jdbc.update("DELETE FROM skin_catalog");
        for(long id:new long[]{9401,9402}) jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                +" VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE deleted_at=NULL",id,"skin-test-"+id,"공방"+id);
        admin=token(9401);other=token(9402);storage.data.clear();storage.available=true;
        model=Files.readAllBytes(Path.of("../frontend/public/art/characters/skins/ssafy-black-male-v3.glb"));
        image=Files.readAllBytes(Path.of("../frontend/src/assets/entry/yeopjeon-icon.webp"));
    }
    Definition definition(String code) { return new Definition(code,"등록 검수 의상",2,"MALE","WHOLE",SkinRules.SLOTS); }
    @Test void sql_order_and_real_http_registration_verify_publish_disable_are_atomic() throws Exception {
        assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE version IN ('157','158','159','160','161') ORDER BY installed_rank",String.class))
                .containsExactly("157","158","159","160","161");
        var created=send("POST","",definition("REGTEST_FULL"),admin);assertThat(created.statusCode()).isEqualTo(200);
        String id=read(created).path("id").asText();
        String upload=uploaded(id);
        assertThat(send("POST","/"+id+"/publish",new Publish(0,upload,true),admin).statusCode()).isEqualTo(409);
        assertThat(send("POST","/"+id+"/uploads/"+upload+"/verify",null,admin).statusCode()).isEqualTo(200);
        assertThat(service.assets()).isEmpty(); // 검증된 미공개 파일을 전체 회원에게 노출하지 않는다.
        var published=send("POST","/"+id+"/publish",new Publish(0,upload,true),admin);
        assertThat(published.statusCode()).as(published.body()).isEqualTo(200);
        assertThat(read(published).path("state").asText()).isEqualTo("PUBLISHED");
        assertThat(send("POST","/"+id+"/publish",new Publish(0,upload,true),admin).body()).isEqualTo(published.body());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM items WHERE item_code LIKE 'SK_REGTEST_FULL_%'",Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT active FROM gacha_products WHERE product_code='REGTEST_FULL'",Boolean.class)).isTrue();
        assertThat(service.assets()).hasSize(1);
        assertThat(service.assets().getFirst().modelUrl()).contains("/published/").doesNotContain("incoming","Signature");
        assertThat(send("POST","/"+id+"/disable",new Version(1),admin).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT active FROM gacha_products WHERE product_code='REGTEST_FULL'",Boolean.class)).isFalse();
        assertThat(service.assets()).hasSize(1);
        assertThat(service.verifyView(9401,id,upload).uploadId()).isEqualTo(upload);
        service.publish(9401,id,new Publish(2,upload,true));
        assertThat(jdbc.queryForObject("SELECT active FROM gacha_products WHERE product_code='REGTEST_FULL'",Boolean.class)).isTrue();
    }
    @Test void anonymous_other_admin_and_client_selected_paths_are_rejected() throws Exception {
        assertThat(send("GET","",null,null).statusCode()).isEqualTo(401);
        assertThat(send("GET","",null,other).statusCode()).isEqualTo(403);
        assertThat(send("POST","",new Definition("../X","의상",1,"MALE","WHOLE",SkinRules.SLOTS),admin).statusCode()).isEqualTo(400);
        var entry=service.create(9401,definition("REGTEST_AUTH"));
        assertThat(send("POST","/"+entry.id()+"/uploads",new UploadRequest(0,new FileSpec("a.glb",20971521,"0".repeat(64)),spec(image,"a.webp")),admin).statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_uploads",Integer.class)).isZero();
    }
    @Test void aws_absent_keeps_drafts_but_never_returns_upload_success() throws Exception {
        storage.available=false;
        var created=send("POST","",definition("REGTEST_NOAWS"),admin);assertThat(created.statusCode()).isEqualTo(200);
        String id=read(created).path("id").asText();
        assertThat(send("POST","/"+id+"/uploads",new UploadRequest(0,spec(model,"a.glb"),spec(image,"a.webp")),admin).statusCode()).isEqualTo(503);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_uploads",Integer.class)).isZero();
        assertThat(read(send("GET","/settings",null,admin)).path("storageReady").asBoolean()).isFalse();
    }
    @Test void disabling_unpublished_draft_cannot_disable_an_existing_external_product() {
        jdbc.update("INSERT INTO gacha_products(product_code,name,grade,compatibility,image_key,active) VALUES('REGTEST_EXTERNAL','기존 상품',1,'MALE','existing',TRUE)");
        var draft=service.create(9401,definition("REGTEST_EXTERNAL"));
        service.disable(9401,draft.id(),new Version(0));
        assertThat(jdbc.queryForObject("SELECT active FROM gacha_products WHERE product_code='REGTEST_EXTERNAL'",Boolean.class)).isTrue();
    }
    @Test void changed_metadata_invalidates_pending_upload_and_public_definition_is_immutable() throws Exception {
        var entry=service.create(9401,definition("REGTEST_VERSION"));String upload=uploaded(entry.id());
        service.save(9401,entry.id(),new Save(0,definition("REGTEST_VERSION")));
        assertThat(send("POST","/"+entry.id()+"/uploads/"+upload+"/verify",null,admin).statusCode()).isEqualTo(409);
        assertThat(send("PUT","/"+entry.id(),new Save(0,definition("REGTEST_VERSION")),admin).statusCode()).isEqualTo(409);
        String current=uploaded(entry.id(),1);service.verify(9401,entry.id(),current);
        service.publish(9401,entry.id(),new Publish(1,current,true));
        assertThat(send("PUT","/"+entry.id(),new Save(2,new Definition("REGTEST_VERSION","이름",1,"MALE","WHOLE",SkinRules.SLOTS)),admin).statusCode()).isEqualTo(409);
    }
    @Test void repeated_concurrent_publication_creates_one_product_and_one_item_per_slot() throws Exception {
        var entry=service.create(9401,definition("REGTEST_RACE"));String upload=uploaded(entry.id());service.verify(9401,entry.id(),upload);
        CountDownLatch start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return service.publish(9401,entry.id(),new Publish(0,upload,true));});
            var b=pool.submit(()->{start.await();return service.publish(9401,entry.id(),new Publish(0,upload,true));});
            start.countDown();assertThat(a.get(20,TimeUnit.SECONDS)).isEqualTo(b.get(20,TimeUnit.SECONDS));
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gacha_products WHERE product_code='REGTEST_RACE'",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM items WHERE item_code LIKE 'SK_REGTEST_RACE_%'",Integer.class)).isEqualTo(5);
    }
    @Test void mutated_staging_cannot_change_sealed_public_model_and_invalid_bytes_never_publish() throws Exception {
        var e=service.create(9401,definition("REGTEST_SEAL"));String id=uploaded(e.id());var u=service.verify(9401,e.id(),id);
        byte[] sealed=storage.data.get(u.prefix()+"/published/model.glb").clone();
        storage.data.put(u.prefix()+"/incoming/model.glb",new byte[]{1,2,3});
        service.publish(9401,e.id(),new Publish(0,id,true));
        assertThat(storage.data.get(u.prefix()+"/published/model.glb")).containsExactly(sealed);
        var bad=service.create(9401,definition("REGTEST_BAD"));String badId=uploaded(bad.id());
        var badUpload=jdbc.queryForObject("SELECT object_prefix FROM skin_uploads WHERE id=?",String.class,badId);
        storage.data.put(badUpload+"/incoming/model.glb",new byte[model.length]);
        assertThat(send("POST","/"+bad.id()+"/uploads/"+badId+"/verify",null,admin).statusCode()).isEqualTo(400);
        assertThat(send("POST","/"+bad.id()+"/publish",new Publish(0,badId,true),admin).statusCode()).isEqualTo(409);
    }
    @Test void published_skin_connects_real_gacha_open_and_existing_wardrobe_equip_without_new_wallet_logic() throws Exception {
        var e=service.create(9401,definition("REGTEST_WEAR"));String upload=uploaded(e.id());service.verify(9401,e.id(),upload);
        service.publish(9401,e.id(),new Publish(0,upload,true));
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(9402,100,0) ON DUPLICATE KEY UPDATE balance=100,reserved_balance=0");
        jdbc.update("INSERT INTO gacha_inventory(user_id,second_boxes) VALUES(9402,2)");
        var result=gacha.open(9402,"skin-registry-open",2);
        assertThat(result.product().code()).isEqualTo("REGTEST_WEAR");assertThat(result.product().itemIds()).hasSize(5);
        Long holding=jdbc.queryForObject("SELECT ui.id FROM user_items ui JOIN items i ON i.id=ui.item_id WHERE ui.user_id=9402 AND i.item_code='SK_REGTEST_WEAR_TOP'",Long.class);
        shop.equip(9402,holding);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=9402 AND is_equipped=TRUE",Integer.class)).isEqualTo(5);
        assertThat(gacha.open(9402,"skin-registry-open",2)).isEqualTo(result);
        assertThat(jdbc.queryForObject("SELECT second_boxes FROM gacha_inventory WHERE user_id=9402",Long.class)).isEqualTo(1);
    }
    String uploaded(String id) throws Exception { return uploaded(id,0); }
    String uploaded(String id,long version) throws Exception {
        var response=send("POST","/"+id+"/uploads",new UploadRequest(version,spec(model,"a.glb"),spec(image,"a.webp")),admin);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);String uploadId=read(response).path("uploadId").asText();
        String prefix=jdbc.queryForObject("SELECT object_prefix FROM skin_uploads WHERE id=?",String.class,uploadId);
        storage.data.put(prefix+"/incoming/model.glb",model.clone());storage.data.put(prefix+"/incoming/image.webp",image.clone());return uploadId;
    }
    FileSpec spec(byte[] bytes,String name) { return new FileSpec(name,bytes.length,SkinFileValidator.sha256(bytes)); }
    String token(long id) { return issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,LoginOutcome.Status.EXISTING_MEMBER,id,null)).accessToken(); }
    JsonNode read(HttpResponse<String> r) throws Exception { return json.readTree(r.body()); }
    HttpResponse<String> send(String method,String path,Object body,String token) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/admin/operations/skins"+path)).timeout(Duration.ofSeconds(30))
                .header("Origin","https://dev.on-top.world");
        if(token!=null) builder.header("Authorization","Bearer "+token);
        if(body!=null) builder.header("Content-Type","application/json");
        return http.send(builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    @TestConfiguration static class StorageConfig { @Bean @Primary FakeStorage testSkinStorage() { return new FakeStorage(); } }
    static class FakeStorage implements SkinStorage {
        final Map<String,byte[]> data=new ConcurrentHashMap<>();volatile boolean available=true;
        public boolean ready() { return available; }
        public Target upload(String key,FileSpec spec,String type) { if(!ready()) throw SkinStorage.unavailable();return new Target("https://upload.example.test/"+key,Map.of("Content-Type",type)); }
        public byte[] read(String key,long size) { byte[] bytes=data.get(key);if(bytes==null) throw new SkinException(409,"SKIN_UPLOAD_INCOMPLETE","업로드 필요");if(bytes.length!=size) throw SkinException.invalid("크기 불일치");return bytes.clone(); }
        public void seal(String key,byte[] bytes,String type,String hash) { data.compute(key,(k,old)->{if(old!=null&&!Arrays.equals(old,bytes)) throw SkinException.invalid("불변 파일 충돌");return bytes.clone();}); }
        public String url(String key) { return "https://cdn.example.test/"+key; }
    }
}
