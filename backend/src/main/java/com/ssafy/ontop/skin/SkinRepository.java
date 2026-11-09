package com.ssafy.ontop.skin;

import com.ssafy.ontop.skin.SkinDtos.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

public class SkinRepository {
    private static final String MODEL_JOINS=" LEFT JOIN skin_upload_models lm ON lm.upload_id=u.id AND lm.character_gender='MALE'"
            +" LEFT JOIN skin_models m ON m.id=lm.model_id LEFT JOIN skin_upload_models lf ON lf.upload_id=u.id AND lf.character_gender='FEMALE'"
            +" LEFT JOIN skin_models f ON f.id=lf.model_id ";
    private static final String MODEL_COLUMNS="m.id male_id,m.file_name male_file,m.model_bytes male_bytes,m.model_sha256 male_hash,"
            +"f.id female_id,f.file_name female_file,f.model_bytes female_bytes,f.model_sha256 female_hash";
    private final JdbcTemplate jdbc;
    public SkinRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public Instant now() { return jdbc.queryForObject("SELECT CURRENT_TIMESTAMP(3)",Timestamp.class).toInstant(); }
    private Entry entry(ResultSet r,int ignored) throws SQLException {
        return new Entry(r.getString("id"),new Definition(r.getString("product_code"),r.getString("name"),r.getInt("grade"),
                r.getString("compatibility"),r.getString("wear_mode"),Arrays.asList(r.getString("slots").split(","))),
                r.getString("state"),r.getLong("state_version"),r.getString("published_upload_id"),r.getTimestamp("updated_at").toInstant());
    }
    public List<Entry> list() { return jdbc.query("SELECT c.* FROM skin_catalog c WHERE NOT EXISTS (SELECT 1 FROM skin_item_registrations r WHERE r.skin_id=c.id) ORDER BY c.updated_at DESC,c.id LIMIT 200",this::entry); }
    public Entry get(String id,boolean lock) {
        return jdbc.query("SELECT * FROM skin_catalog WHERE id=?"+(lock?" FOR UPDATE":""),this::entry,id).stream().findFirst()
                .orElseThrow(()->new SkinException(404,"SKIN_NOT_FOUND","등록한 스킨을 찾지 못했습니다."));
    }
    public void create(String id,Definition d,long user) {
        jdbc.update("INSERT INTO skin_catalog(id,product_code,name,grade,compatibility,wear_mode,slots,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)",
                id,d.productCode(),d.name(),d.grade(),d.compatibility(),d.wearMode(),String.join(",",d.slots()),user,user);
    }
    public void update(Entry before,Definition d,long user) {
        jdbc.update("UPDATE skin_catalog SET name=?,grade=?,compatibility=?,wear_mode=?,slots=?,state_version=state_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
                d.name(),d.grade(),d.compatibility(),d.wearMode(),String.join(",",d.slots()),user,before.id());
    }
    public void insertUpload(Upload u,long user) {
        jdbc.update("INSERT INTO skin_uploads(id,skin_id,catalog_version,model_bytes,image_bytes,model_sha256,image_sha256,object_prefix,expires_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
                u.id(),u.skinId(),u.catalogVersion(),u.modelBytes(),u.imageBytes(),u.modelSha256(),u.imageSha256(),u.prefix(),Timestamp.from(u.expiresAt()),user);
        for(ModelFile file:java.util.stream.Stream.of(u.maleModel(),u.femaleModel()).filter(java.util.Objects::nonNull).distinct().toList())
            jdbc.update("INSERT INTO skin_models(id,upload_id,file_name,model_bytes,model_sha256) VALUES(?,?,?,?,?)",
                    file.id(),u.id(),file.fileName(),file.bytes(),file.sha256());
        linkModel(u.id(),"MALE",u.maleModel());linkModel(u.id(),"FEMALE",u.femaleModel());
    }
    private void linkModel(String upload,String gender,ModelFile file) {
        if(file!=null) jdbc.update("INSERT INTO skin_upload_models(upload_id,character_gender,model_id) VALUES(?,?,?)",upload,gender,file.id());
    }
    private ModelFile model(ResultSet r,String gender) throws SQLException {
        return r.getString(gender+"_id")==null?null:new ModelFile(r.getString(gender+"_id"),r.getString(gender+"_file"),r.getLong(gender+"_bytes"),r.getString(gender+"_hash"));
    }
    public Upload upload(String skinId,String id) {
        return jdbc.query("SELECT u.*,"+MODEL_COLUMNS+" FROM skin_uploads u"+MODEL_JOINS+"WHERE u.skin_id=? AND u.id=?",(r,n)->new Upload(r.getString("id"),r.getString("skin_id"),
                r.getLong("catalog_version"),r.getLong("model_bytes"),r.getLong("image_bytes"),r.getString("model_sha256"),r.getString("image_sha256"),
                r.getString("object_prefix"),r.getTimestamp("expires_at").toInstant(),r.getTimestamp("verified_at")==null?null:r.getTimestamp("verified_at").toInstant(),
                model(r,"male"),model(r,"female")),skinId,id)
                .stream().findFirst().orElseThrow(()->new SkinException(404,"SKIN_UPLOAD_NOT_FOUND","파일 버전을 찾지 못했습니다."));
    }
    public void verified(String id) { jdbc.update("UPDATE skin_uploads SET verified_at=CURRENT_TIMESTAMP(3) WHERE id=? AND verified_at IS NULL",id); }
    public List<Entry> components() {
        return jdbc.query("SELECT c.* FROM skin_catalog c JOIN skin_item_registrations r ON r.skin_id=c.id ORDER BY c.updated_at DESC,c.id LIMIT 200",this::entry);
    }
    public boolean isComponent(String id) { return jdbc.queryForObject("SELECT COUNT(*) FROM skin_item_registrations WHERE skin_id=?",Integer.class,id)>0; }
    public void markComponent(String id) { jdbc.update("INSERT INTO skin_item_registrations VALUES(?)",id); }
    public List<Long> componentParts(String id) { return jdbc.queryForList("SELECT item_id FROM skin_item_parts WHERE skin_id=? ORDER BY item_id",Long.class,id); }
    private void publishComponent(Entry e,Upload u,long user) {
        var d=e.definition();String key="catalog/"+u.id();
        if(e.publishedUploadId()==null) for(String slot:d.slots()) {
            String code="SK_"+d.productCode()+"_"+slot;
            jdbc.update("INSERT INTO items(item_code,name,item_type,equip_slot,price,image_key,is_for_sale,set_code) VALUES(?,?,'EQUIPMENT',?,0,?,FALSE,?)",
                    code,d.name(),slot,key,d.slots().size()>1?"SK_"+d.productCode():null);
            Long part=jdbc.queryForObject("SELECT id FROM items WHERE item_code=?",Long.class,code);
            jdbc.update("INSERT INTO skin_item_parts VALUES(?,?)",e.id(),part);
        }
        jdbc.update("UPDATE items i JOIN skin_item_parts p ON p.item_id=i.id SET i.image_key=?,i.name=? WHERE p.skin_id=?",key,d.name(),e.id());
        finishPublish(e,u,user);
    }
    private void finishPublish(Entry e,Upload u,long user) {
        jdbc.update("UPDATE skin_catalog SET state='PUBLISHED',published_upload_id=?,state_version=state_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",u.id(),user,e.id());
        jdbc.update("UPDATE skin_uploads SET published_at=COALESCE(published_at,CURRENT_TIMESTAMP(3)) WHERE id=?",u.id());
    }
    public void publish(Entry e,Upload u,long user) {
        if(isComponent(e.id())) { publishComponent(e,u,user);return; }
        // 기존 소비 흐름의 상품→구성 아이템 잠금 순서를 따른다. 지갑/보유품은 수정하지 않는다.
        var d=e.definition(); String key="catalog/"+u.id();
        var existing=jdbc.queryForList("SELECT product_code FROM gacha_products WHERE product_code=? FOR UPDATE",String.class,d.productCode());
        if(existing.isEmpty()) {
            jdbc.update("INSERT INTO gacha_products(product_code,name,grade,compatibility,image_key,active) VALUES(?,?,?,?,?,FALSE)",d.productCode(),d.name(),d.grade(),d.compatibility(),key);
            for(String slot:d.slots()) {
                String code="SK_"+d.productCode()+"_"+slot;
                jdbc.update("INSERT INTO items(item_code,name,item_type,equip_slot,price,image_key,is_for_sale,set_code) VALUES(?,?,'EQUIPMENT',?,0,?,FALSE,?)",
                        code,d.name(),slot,key,d.slots().size()>1?"SK_"+d.productCode():null);
                Long id=jdbc.queryForObject("SELECT id FROM items WHERE item_code=?",Long.class,code);
                jdbc.update("INSERT INTO gacha_product_items(product_code,item_id) VALUES(?,?)",d.productCode(),id);
            }
        } else if(e.publishedUploadId()==null) throw new SkinException(409,"SKIN_PRODUCT_CODE_CONFLICT","이미 사용 중인 상품 코드입니다.");
        jdbc.update("UPDATE items i JOIN gacha_product_items p ON p.item_id=i.id SET i.image_key=?,i.name=? WHERE p.product_code=?",key,d.name(),d.productCode());
        jdbc.update("UPDATE gacha_products SET name=?,image_key=?,active=TRUE WHERE product_code=?",d.name(),key,d.productCode());
        jdbc.update("UPDATE skin_catalog SET state='PUBLISHED',published_upload_id=?,state_version=state_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",u.id(),user,e.id());
        jdbc.update("UPDATE skin_uploads SET published_at=COALESCE(published_at,CURRENT_TIMESTAMP(3)) WHERE id=?",u.id());
    }
    public void disable(Entry e,long user) {
        if(e.publishedUploadId()!=null&&!isComponent(e.id())) jdbc.update("UPDATE gacha_products SET active=FALSE WHERE product_code=?",e.definition().productCode());
        jdbc.update("UPDATE skin_catalog SET state='DISABLED',state_version=state_version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",user,e.id());
    }
    /** 이전 확정 상품/영수증 및 비활성 스킨의 보유자도 모델을 계속 읽을 수 있다. 임시 파일은 제외한다. */
    public record Published(Definition definition,String uploadId,String prefix,ModelFile maleModel,ModelFile femaleModel) { }
    public List<Published> publishedUploads() {
        return jdbc.query("SELECT c.product_code,c.name,c.grade,c.compatibility,c.wear_mode,c.slots,u.id,u.object_prefix,"+MODEL_COLUMNS
                +" FROM skin_uploads u JOIN skin_catalog c ON c.id=u.skin_id"+MODEL_JOINS+"WHERE u.published_at IS NOT NULL ORDER BY u.created_at LIMIT 2000",
                (r,n)->new Published(new Definition(r.getString(1),r.getString(2),r.getInt(3),r.getString(4),r.getString(5),
                        Arrays.asList(r.getString(6).split(","))),r.getString(7),r.getString(8),model(r,"male"),model(r,"female")));
    }
}
