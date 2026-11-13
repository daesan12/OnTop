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
    @Autowired SkinSetService sets;
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
        jdbc.update("DELETE FROM gacha_receipts WHERE user_id IN (9401,9402)");
        jdbc.update("DELETE FROM wallet_transactions WHERE idempotency_key LIKE 'gacha:9401:%' OR idempotency_key LIKE 'gacha:9402:%'");
        jdbc.update("DELETE FROM gacha_inventory WHERE user_id IN (9401,9402)");
        jdbc.update("DELETE FROM gacha_product_items WHERE product_code LIKE 'REGTEST_%'");
        jdbc.update("DELETE FROM gacha_products WHERE product_code LIKE 'REGTEST_%'");
        jdbc.update("DELETE FROM skin_set_members");jdbc.update("DELETE FROM skin_sets");
        jdbc.update("DELETE FROM skin_item_parts");jdbc.update("DELETE FROM skin_item_registrations");
        jdbc.update("DELETE FROM items WHERE item_code LIKE 'SK_REGTEST_%'");
        jdbc.update("DELETE FROM skin_uploads");jdbc.update("DELETE FROM skin_catalog");
        for(long id:new long[]{9401,9402}) jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                +" VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE deleted_at=NULL,character_gender='MALE'",id,"skin-test-"+id,"공방"+id);
        admin=token(9401);other=token(9402);storage.data.clear();storage.available=true;
        model=Files.readAllBytes(Path.of("../frontend/public/art/characters/skins/ssafy-black-male-v3.glb"));
        image=Files.readAllBytes(Path.of("../frontend/src/assets/entry/yeopjeon-icon.webp"));
    }
    Definition definition(String code) { return new Definition(code,"등록 검수 의상",2,"MALE","WHOLE",SkinRules.SLOTS); }
    @Test void sql_order_and_real_http_registration_verify_publish_disable_are_atomic() throws Exception {
        assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE version IN ('157','158','159','160','161','162') ORDER BY installed_rank",String.class))
                .containsExactly("157","158","159","160","161","162");
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
    @Test void deleting_a_draft_requires_admin_and_current_version_and_hides_it_without_storage() throws Exception {
        var e=service.createComponent(9401,definition("REGTEST_DELETE_DRAFT"));storage.available=false;
        assertThat(send("DELETE","/"+e.id()+"?version=0",null,null).statusCode()).isEqualTo(401);
        assertThat(send("DELETE","/"+e.id()+"?version=0",null,other).statusCode()).isEqualTo(403);
        assertThat(send("DELETE","/"+e.id()+"?version=1",null,admin).statusCode()).isEqualTo(409);
        assertThat(send("DELETE","/"+e.id(),null,admin).statusCode()).isEqualTo(400);
        assertThat(send("DELETE","/"+e.id()+"?version=bad",null,admin).statusCode()).isEqualTo(400);
        assertThat(send("DELETE","/"+e.id()+"?version=-1",null,admin).statusCode()).isEqualTo(400);
        assertThat(service.components(9401)).extracting(Entry::id).contains(e.id());
        assertThat(send("DELETE","/"+e.id()+"?version=0",null,admin).statusCode()).isEqualTo(204);
        assertThat(service.components(9401)).extracting(Entry::id).doesNotContain(e.id());
        assertThat(send("GET","/"+e.id(),null,admin).statusCode()).isEqualTo(404);
        assertThat(send("POST","/"+e.id()+"/disable",new Version(1),admin).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT deleted_by FROM skin_catalog WHERE id=? AND deleted_at IS NOT NULL",Long.class,e.id())).isEqualTo(9401);
    }
    @Test void referenced_components_require_set_deletion_and_deleted_sets_cannot_be_republished() throws Exception {
        var head=componentFixture("REGTEST_DELETE_HEAD",List.of("HAIR","FACE"));
        var d=sets.create(9401,new SkinSetDtos.Definition("REGTEST_DELETE_SET","삭제 검수 세트",2,"MALE",head.id(),List.of(head.id())));
        var rejected=send("DELETE","/"+head.id()+"?version="+head.version(),null,admin);
        assertThat(rejected.statusCode()).isEqualTo(409);assertThat(read(rejected).path("code").asText()).isEqualTo("SKIN_IN_USE");
        assertThat(send("DELETE","/sets/"+d.id(),null,admin).statusCode()).isEqualTo(400);
        assertThat(send("DELETE","/sets/"+d.id()+"?version=bad",null,admin).statusCode()).isEqualTo(400);
        assertThat(send("DELETE","/sets/"+d.id()+"?version=-1",null,admin).statusCode()).isEqualTo(400);
        assertThat(send("DELETE","/sets/"+d.id()+"?version=0",null,other).statusCode()).isEqualTo(403);
        assertThat(send("DELETE","/sets/"+d.id()+"?version=1",null,admin).statusCode()).isEqualTo(409);
        assertThat(send("DELETE","/sets/"+d.id()+"?version=0",null,admin).statusCode()).isEqualTo(204);
        assertThat(sets.list(9401)).isEmpty();
        assertThat(send("POST","/sets/"+d.id()+"/publish",new Version(1),admin).statusCode()).isEqualTo(404);
        assertThat(send("DELETE","/"+head.id()+"?version="+head.version(),null,admin).statusCode()).isEqualTo(204);
        assertThat(service.assets()).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_set_members WHERE set_id=?",Integer.class,d.id())).isEqualTo(1);
    }
    @Test void image_only_reference_blocks_deletion_even_without_a_membership_row() throws Exception {
        var head=componentFixture("REGTEST_IMAGE_ONLY",List.of("HAIR","FACE"));
        var d=sets.create(9401,new SkinSetDtos.Definition("REGTEST_IMAGE_ONLY_SET","대표 이미지 참조",2,"MALE",head.id(),List.of(head.id())));
        jdbc.update("DELETE FROM skin_set_members WHERE set_id=?",d.id());
        var rejected=send("DELETE","/"+head.id()+"?version="+head.version(),null,admin);
        assertThat(rejected.statusCode()).isEqualTo(409);
        assertThat(read(rejected).path("code").asText()).isEqualTo("SKIN_IN_USE");
        assertThat(send("DELETE","/sets/"+d.id()+"?version=0",null,admin).statusCode()).isEqualTo(204);
        assertThat(send("DELETE","/"+head.id()+"?version="+head.version(),null,admin).statusCode()).isEqualTo(204);
    }
    @Test void deleting_a_published_legacy_skin_stops_acquisition_but_keeps_equipped_items_and_models() throws Exception {
        var draft=service.create(9401,definition("REGTEST_DELETE_LEGACY"));String upload=uploaded(draft.id());
        jdbc.update("UPDATE skin_uploads SET verified_at=CURRENT_TIMESTAMP(3) WHERE id=?",upload);
        var published=service.publish(9401,draft.id(),new Publish(0,upload,true));
        jdbc.update("INSERT INTO user_items(user_id,item_id,quantity,is_equipped) SELECT 9402,item_id,1,TRUE FROM gacha_product_items WHERE product_code='REGTEST_DELETE_LEGACY'");
        var owned=jdbc.queryForList("SELECT id,item_id,quantity,is_equipped FROM user_items WHERE user_id=9402 ORDER BY id");
        assertThat(send("DELETE","/"+draft.id()+"?version="+published.version(),null,admin).statusCode()).isEqualTo(204);
        assertThat(service.list(9401)).isEmpty();assertThat(service.assets()).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT active FROM gacha_products WHERE product_code='REGTEST_DELETE_LEGACY'",Boolean.class)).isFalse();
        assertThat(jdbc.queryForList("SELECT id,item_id,quantity,is_equipped FROM user_items WHERE user_id=9402 ORDER BY id")).isEqualTo(owned);
        assertThat(send("POST","/"+draft.id()+"/publish",new Publish(published.version()+1,upload,true),admin).statusCode()).isEqualTo(404);
    }
    @Test void concurrent_set_creation_and_component_deletion_never_publish_a_deleted_member() throws Exception {
        var head=componentFixture("REGTEST_DELETE_RACE",List.of("HAIR","FACE"));
        try(var pool=Executors.newFixedThreadPool(2)){
            var start=new CountDownLatch(1);
            var deletion=pool.submit(()->{start.await();try{service.delete(9401,head.id(),new Version(head.version()));}catch(SkinException expected){assertThat(expected.status()).isIn(404,409);}return true;});
            var creation=pool.submit(()->{start.await();try{sets.create(9401,new SkinSetDtos.Definition("REGTEST_DELETE_RACE_SET","경합 세트",2,"MALE",head.id(),List.of(head.id())));}catch(SkinException expected){assertThat(expected.status()).isIn(404,409);}return true;});
            start.countDown();assertThat(deletion.get(10,TimeUnit.SECONDS)).isTrue();assertThat(creation.get(10,TimeUnit.SECONDS)).isTrue();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_sets s JOIN skin_set_members m ON m.set_id=s.id JOIN skin_catalog c ON c.id=m.skin_id WHERE s.deleted_at IS NULL AND c.deleted_at IS NOT NULL",Integer.class)).isZero();
        }
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
        jdbc.update("UPDATE gacha_receipts SET result_json=JSON_REMOVE(result_json,'$.product.components') WHERE user_id=9402 AND operation_id='skin-registry-open'");
        assertThat(gacha.open(9402,"skin-registry-open",2)).isEqualTo(result);
        assertThat(jdbc.queryForObject("SELECT second_boxes FROM gacha_inventory WHERE user_id=9402",Long.class)).isEqualTo(1);
    }
    @Test void paired_models_are_two_files_but_one_product_and_choose_distinct_character_ids() throws Exception {
        var e=service.create(9401,SkinRules.modelDefinition(definition("REGTEST_PAIR"),"ANY"));
        byte[] female=Files.readAllBytes(Path.of("../frontend/public/art/characters/girl.glb"));
        var ticket=service.issue(9401,e.id(),new UploadRequest(0,spec(model,"male.glb"),spec(image,"image.webp"),spec(female,"female.glb")));
        String prefix=jdbc.queryForObject("SELECT object_prefix FROM skin_uploads WHERE id=?",String.class,ticket.uploadId());
        assertThat(ticket.femaleModel()).isNotNull();
        storage.data.put(prefix+"/incoming/model.glb",model);storage.data.put(prefix+"/incoming/image.webp",image);
        // 한쪽 파일만 도착한 상태는 성공·공개로 처리하지 않는다.
        assertThatThrownBy(()->service.verify(9401,e.id(),ticket.uploadId())).isInstanceOf(SkinException.class);
        assertThat(service.assets()).isEmpty();
        assertThatThrownBy(()->service.publish(9401,e.id(),new Publish(0,ticket.uploadId(),true))).isInstanceOf(SkinException.class);
        storage.data.put(prefix+"/incoming/female.glb",female);
        var verified=service.verifyView(9401,e.id(),ticket.uploadId());
        assertThat(verified.maleModelId()).isNotEqualTo(verified.femaleModelId());
        assertThat(verified.femaleModelUrl()).endsWith("/published/female.glb");
        service.publish(9401,e.id(),new Publish(0,ticket.uploadId(),true));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_models",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_upload_models",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gacha_products WHERE product_code='REGTEST_PAIR'",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM items WHERE item_code LIKE 'SK_REGTEST_PAIR_%'",Integer.class)).isEqualTo(5);
        assertThat(service.assets().getFirst().femaleModelId()).isEqualTo(verified.femaleModelId());
    }
    @Test void common_skin_has_one_model_referenced_by_both_characters() throws Exception {
        var e=service.create(9401,SkinRules.modelDefinition(definition("REGTEST_COMMON"),"ANY"));String upload=uploaded(e.id());
        var verified=service.verifyView(9401,e.id(),upload);
        assertThat(verified.maleModelId()).isNotNull().isEqualTo(verified.femaleModelId());
        assertThat(verified.femaleModelUrl()).isEqualTo(verified.modelUrl());
        service.publish(9401,e.id(),new Publish(0,upload,true));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_models",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_upload_models",Integer.class)).isEqualTo(2);
        assertThat(service.assets().getFirst().compatibility()).isEqualTo("ANY");
    }
    @Test void male_model_in_female_slot_is_rejected_and_cannot_publish() throws Exception {
        var e=service.create(9401,SkinRules.modelDefinition(definition("REGTEST_BADPAIR"),"ANY"));
        byte[] anotherMale=Files.readAllBytes(Path.of("../frontend/public/art/characters/man.glb"));
        var ticket=service.issue(9401,e.id(),new UploadRequest(0,spec(model,"male.glb"),spec(image,"image.webp"),spec(anotherMale,"female.glb")));
        String prefix=jdbc.queryForObject("SELECT object_prefix FROM skin_uploads WHERE id=?",String.class,ticket.uploadId());
        storage.data.put(prefix+"/incoming/model.glb",model);storage.data.put(prefix+"/incoming/image.webp",image);storage.data.put(prefix+"/incoming/female.glb",anotherMale);
        assertThatThrownBy(()->service.verify(9401,e.id(),ticket.uploadId())).isInstanceOf(SkinException.class).hasMessageContaining("성별");
        assertThat(jdbc.queryForObject("SELECT verified_at IS NULL FROM skin_uploads WHERE id=?",Boolean.class,ticket.uploadId())).isTrue();
        assertThatThrownBy(()->service.publish(9401,e.id(),new Publish(0,ticket.uploadId(),true))).isInstanceOf(SkinException.class);
    }
    @Test void selecting_identical_common_file_twice_reuses_one_model_row() {
        var e=service.create(9401,SkinRules.modelDefinition(definition("REGTEST_SAME"),"ANY"));
        var ticket=service.issue(9401,e.id(),new UploadRequest(0,spec(model,"male.glb"),spec(image,"image.webp"),spec(model,"same.glb")));
        assertThat(ticket.femaleModel()).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_models",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT model_id) FROM skin_upload_models",Integer.class)).isEqualTo(1);
    }
    @Test void incomplete_links_never_skip_model_validation_and_other_versions_cannot_be_linked() throws Exception {
        var e=service.create(9401,SkinRules.modelDefinition(definition("REGTEST_LINKS"),"ANY"));String first=uploaded(e.id()),second=uploaded(e.id());
        String otherModel=jdbc.queryForObject("SELECT id FROM skin_models WHERE upload_id=?",String.class,second);
        assertThatThrownBy(()->jdbc.update("UPDATE skin_upload_models SET model_id=? WHERE upload_id=? AND character_gender='FEMALE'",otherModel,first))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        jdbc.update("DELETE FROM skin_upload_models WHERE upload_id=? AND character_gender='FEMALE'",first);
        assertThatThrownBy(()->service.verify(9401,e.id(),first)).isInstanceOf(SkinException.class).hasMessageContaining("모델 연결");
        assertThat(jdbc.queryForObject("SELECT verified_at IS NULL FROM skin_uploads WHERE id=?",Boolean.class,first)).isTrue();
        assertThatThrownBy(()->service.publish(9401,e.id(),new Publish(0,first,true))).isInstanceOf(SkinException.class);
    }
    // Set tests use already-verified upload fixtures; file validation itself is covered above.
    SkinDtos.Entry componentFixture(String code,List<String> slots) throws Exception {
        return componentFixture(code,slots,"MALE");
    }
    SkinDtos.Entry componentFixture(String code,List<String> slots,String character) throws Exception {
        var d=new Definition(code,code.equals("REGTEST_HEAD")?"선비 머리":"도포",2,character,"PARTS",slots);
        var e=service.createComponent(9401,d);String upload=uploaded(e.id());
        jdbc.update("UPDATE skin_uploads SET verified_at=CURRENT_TIMESTAMP(3) WHERE id=?",upload);
        return service.publish(9401,e.id(),new Publish(0,upload,true));
    }
    SkinSetDtos.Definition setDefinition(String code,SkinDtos.Entry head,SkinDtos.Entry clothes) {
        return new SkinSetDtos.Definition(code,"선비 세트",2,"MALE",head.id(),List.of(head.id(),clothes.id()));
    }
    @Test void catalog_query_count_and_component_insert_id_lookup_are_measured() throws Exception {
        var head=componentFixture("REGTEST_HEAD",List.of("HAIR","FACE"));
        var clothes=componentFixture("REGTEST_CLOTHES",List.of("TOP","BOTTOM","SHOES"));
        var one=sets.create(9401,setDefinition("REGTEST_QUERY_ONE",head,clothes));sets.publish(9401,one.id(),0);
        var probe=new SqlProbe(jdbc.getDataSource());
        var products=new com.ssafy.ontop.gacha.GachaRepository(probe.jdbc);
        assertThat(products.products(true,false)).filteredOn(p->p.code().equals("REGTEST_QUERY_ONE"))
                .singleElement().satisfies(p->assertThat(p.components()).hasSize(2));
        int single=probe.statements.size();probe.statements.clear();
        var two=sets.create(9401,setDefinition("REGTEST_QUERY_TWO",head,clothes));sets.publish(9401,two.id(),0);
        assertThat(products.products(true,false)).filteredOn(p->p.code().startsWith("REGTEST_QUERY_"))
                .hasSize(2).allSatisfy(p->assertThat(p.components()).hasSize(2));
        int shared=probe.statements.size();
        var e=service.createComponent(9401,new Definition("REGTEST_QUERY_INSERT","조회 검수",2,"MALE","PARTS",List.of("HAIR","FACE")));
        String upload=uploaded(e.id());var repository=new SkinRepository(jdbc);
        var inserts=new SqlProbe(jdbc.getDataSource());
        new SkinRepository(inserts.jdbc).publish(e,repository.upload(e.id(),upload),9401);
        long idLookups=inserts.statements.stream().filter(s->s.startsWith("SELECT id FROM items WHERE item_code=")).count();
        assertThat(repository.componentParts(e.id())).hasSize(2);
        System.out.printf("SKIN_SQL_COUNT products_one_set=%d products_two_sets=%d component_two_slot_id_selects=%d%n",single,shared,idLookups);
        assertThat(single).isEqualTo(3);assertThat(shared).isEqualTo(3);assertThat(idLookups).isZero();
    }
    @Test void set_open_grants_all_components_but_head_and_clothes_equip_independently() throws Exception {
        var head=componentFixture("REGTEST_HEAD",List.of("HAIR","FACE"));
        var clothes=componentFixture("REGTEST_CLOTHES",List.of("TOP","BOTTOM","SHOES"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gacha_products WHERE product_code LIKE 'REGTEST_%'",Integer.class)).isZero();
        var draft=sets.create(9401,setDefinition("REGTEST_SET",head,clothes));
        var published=sets.publish(9401,draft.id(),0);
        assertThat(sets.publish(9401,draft.id(),0)).isEqualTo(published);
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(9402,100,0) ON DUPLICATE KEY UPDATE balance=100,reserved_balance=0");
        jdbc.update("INSERT INTO gacha_inventory(user_id,second_boxes) VALUES(9402,2)");
        var result=gacha.open(9402,"set-open-once",2);
        assertThat(result.product().itemIds()).hasSize(5);assertThat(result.product().components()).hasSize(2);assertThat(gacha.open(9402,"set-open-once",2)).isEqualTo(result);
        var headId=jdbc.queryForObject("SELECT ui.id FROM user_items ui JOIN items i ON i.id=ui.item_id WHERE ui.user_id=9402 AND i.item_code='SK_REGTEST_HEAD_HAIR'",Long.class);
        var clothesId=jdbc.queryForObject("SELECT ui.id FROM user_items ui JOIN items i ON i.id=ui.item_id WHERE ui.user_id=9402 AND i.item_code='SK_REGTEST_CLOTHES_TOP'",Long.class);
        shop.equip(9402,headId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=9402 AND is_equipped=TRUE",Long.class)).isEqualTo(2);
        shop.equip(9402,clothesId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=9402 AND is_equipped=TRUE",Integer.class)).isEqualTo(5);
        shop.unequip(9402,headId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=9402 AND is_equipped=TRUE",Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=9402",Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT second_boxes FROM gacha_inventory WHERE user_id=9402",Integer.class)).isEqualTo(1);
        assertThatThrownBy(()->sets.save(9401,draft.id(),new SkinSetDtos.Save(published.version(),setDefinition("REGTEST_SET",head,clothes))))
                .isInstanceOf(SkinException.class).hasMessageContaining("새 세트");
        sets.disable(9401,draft.id(),published.version());
        assertThat(gacha.open(9402,"set-open-once",2)).isEqualTo(result);
        assertThat(service.assets()).hasSize(2);
        var owned=jdbc.queryForList("SELECT id,item_id,quantity,is_equipped FROM user_items WHERE user_id=9402 ORDER BY id");
        sets.delete(9401,draft.id(),published.version()+1);
        service.delete(9401,head.id(),new Version(head.version()));service.delete(9401,clothes.id(),new Version(clothes.version()));
        assertThat(sets.list(9401)).isEmpty();assertThat(service.components(9401)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT active FROM gacha_products WHERE product_code='REGTEST_SET'",Boolean.class)).isFalse();
        assertThat(jdbc.queryForList("SELECT id,item_id,quantity,is_equipped FROM user_items WHERE user_id=9402 ORDER BY id")).isEqualTo(owned);
        assertThat(service.assets()).hasSize(2);assertThat(gacha.open(9402,"set-open-once",2)).isEqualTo(result);
        shop.equip(9402,headId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=9402 AND is_equipped=TRUE",Integer.class)).isEqualTo(5);
    }
    @Test void overlapping_components_and_stale_versions_are_rejected_without_partial_set_changes() throws Exception {
        var head=componentFixture("REGTEST_HEAD",List.of("HAIR","FACE"));
        var hair=componentFixture("REGTEST_HAIR",List.of("HAIR"));
        var conflict=new SkinSetDtos.Definition("REGTEST_CONFLICT","겹침",2,"MALE",head.id(),List.of(head.id(),hair.id()));
        assertThatThrownBy(()->sets.create(9401,conflict)).isInstanceOf(SkinException.class).hasMessageContaining("겹쳐요");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skin_sets",Integer.class)).isZero();
        var d=new SkinSetDtos.Definition("REGTEST_ONE","단품 세트",2,"MALE",head.id(),List.of(head.id()));
        var e=sets.create(9401,d);
        var saved=sets.save(9401,e.id(),new SkinSetDtos.Save(0,d));
        assertThatThrownBy(()->sets.publish(9401,e.id(),0)).isInstanceOf(SkinException.class).hasMessageContaining("다른 창");
        assertThat(saved.version()).isEqualTo(1);
        assertThatThrownBy(()->sets.list(9402)).isInstanceOf(SkinException.class);
    }
    @Test void set_publication_does_not_rewrite_legacy_ownership_or_equipment() throws Exception {
        var legacy=service.create(9401,definition("REGTEST_LEGACY"));var u=uploaded(legacy.id());service.verify(9401,legacy.id(),u);service.publish(9401,legacy.id(),new Publish(0,u,true));
        jdbc.update("INSERT INTO user_items(user_id,item_id,quantity,is_equipped) SELECT 9402,item_id,1,TRUE FROM gacha_product_items WHERE product_code='REGTEST_LEGACY'");
        var before=jdbc.queryForList("SELECT id,item_id,quantity,is_equipped FROM user_items WHERE user_id=9402 ORDER BY id");
        var head=componentFixture("REGTEST_HEAD",List.of("HAIR","FACE"));var clothes=componentFixture("REGTEST_CLOTHES",List.of("TOP","BOTTOM","SHOES"));
        var d=sets.create(9401,setDefinition("REGTEST_PRESERVE",head,clothes));sets.publish(9401,d.id(),0);
        assertThat(jdbc.queryForList("SELECT id,item_id,quantity,is_equipped FROM user_items WHERE user_id=9402 ORDER BY id")).isEqualTo(before);
    }
    @Test void shared_components_publish_for_both_genders_and_keep_legacy_links_and_value() throws Exception {
        var head=componentFixture("REGTEST_COMMON_HEAD",List.of("HAIR","FACE"),"ANY");
        var clothes=componentFixture("REGTEST_COMMON_CLOTHES",List.of("TOP","BOTTOM","SHOES"),"ANY");
        var male=sets.create(9401,new SkinSetDtos.Definition("REGTEST_COMMON_MALE","남자 공용 세트",3,"MALE",head.id(),List.of(head.id(),clothes.id())));
        var female=sets.create(9401,new SkinSetDtos.Definition("REGTEST_COMMON_FEMALE","여자 공용 세트",3,"FEMALE",head.id(),List.of(head.id(),clothes.id())));
        sets.publish(9401,male.id(),0);sets.publish(9401,female.id(),0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gacha_product_items WHERE product_code LIKE 'REGTEST_COMMON_%'",Integer.class)).isZero();
        // A previously published set may still have its old unique item links. UNION must not double them.
        for(long part:mrParts(head,clothes)) jdbc.update("INSERT INTO gacha_product_items VALUES(?,?)",male.definition().productCode(),part);
        jdbc.update("UPDATE users SET character_gender='FEMALE' WHERE id=9402");
        for(long user:new long[]{9401,9402}) {
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,100,0) ON DUPLICATE KEY UPDATE balance=100,reserved_balance=0",user);
            jdbc.update("INSERT INTO gacha_inventory(user_id,third_boxes) VALUES(?,2) ON DUPLICATE KEY UPDATE third_boxes=2",user);
        }
        var mr=gacha.open(9401,"shared-male-open",3);var fr=gacha.open(9402,"shared-female-open",3);
        assertThat(mr.product().compatibility()).isEqualTo("MALE");assertThat(fr.product().compatibility()).isEqualTo("FEMALE");
        assertThat(mr.product().itemIds()).hasSize(5).containsExactlyElementsOf(fr.product().itemIds());
        assertThat(mr.product().components()).hasSize(2);assertThat(fr.product().components()).hasSize(2);
        assertThat(gacha.open(9401,"shared-male-open",3)).isEqualTo(mr);
        for(long user:new long[]{9401,9402}) {
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=?",Integer.class,user)).isEqualTo(5);
            Long owned=jdbc.queryForObject("SELECT ui.id FROM user_items ui JOIN skin_item_parts p ON p.item_id=ui.item_id WHERE ui.user_id=? AND p.skin_id=? ORDER BY ui.id LIMIT 1",Long.class,user,head.id());
            shop.equip(user,owned);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_items WHERE user_id=? AND is_equipped=TRUE",Integer.class,user)).isEqualTo(2);
            // The male and female sets share the same items: one design, owned once, valued once (B 250, not 2 x 250).
            assertThat(jdbc.queryForObject("SELECT ga.equipment_value FROM wallets w "+com.ssafy.ontop.gacha.GachaAssetSql.JOIN+" WHERE w.user_id=?",Long.class,user)).isEqualTo(250L);
        }
    }
    List<Long> mrParts(SkinDtos.Entry head,SkinDtos.Entry clothes) {
        return jdbc.queryForList("SELECT item_id FROM skin_item_parts WHERE skin_id IN (?,?) ORDER BY item_id",Long.class,head.id(),clothes.id());
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
