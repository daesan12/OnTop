package com.ssafy.ontop.skin;

import com.ssafy.ontop.skin.SkinSetDtos.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;
import java.util.function.LongPredicate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 기존 소유품/영수증을 수정하지 않고 등록 아이템들을 하나의 획득 상품으로 구성한다. */
public class SkinSetService {
    private final JdbcTemplate jdbc;
    private final SkinRepository items;
    private final SkinSettings settings;
    private final LongPredicate operator;
    private final TransactionTemplate tx;
    public SkinSetService(JdbcTemplate jdbc,SkinRepository items,SkinSettings settings,
                          PlatformTransactionManager manager,LongPredicate operator) {
        this.jdbc=jdbc;this.items=items;this.settings=settings;this.operator=operator;tx=new TransactionTemplate(manager);
    }
    private void access(long user) {
        settings.requireAdmin(user);if(!operator.test(user)) throw new SkinException(403,"SKIN_ACCESS_DENIED","운영 권한이 필요합니다.");
    }
    private Entry row(ResultSet r,int n) throws SQLException {
        String id=r.getString("id");
        var members=jdbc.queryForList("SELECT skin_id FROM skin_set_members WHERE set_id=? ORDER BY skin_id",String.class,id);
        var published=r.getTimestamp("published_at");
        return new Entry(id,new Definition(r.getString("product_code"),r.getString("name"),r.getInt("grade"),
                r.getString("compatibility"),r.getString("image_skin_id"),members),r.getString("state"),r.getLong("state_version"),
                published==null?null:published.toInstant());
    }
    private Entry get(String id,boolean lock) {
        return jdbc.query("SELECT * FROM skin_sets WHERE id=?"+(lock?" FOR UPDATE":""),this::row,id).stream().findFirst()
                .orElseThrow(()->new SkinException(404,"SKIN_SET_NOT_FOUND","세트를 찾지 못했어요."));
    }
    public List<Entry> list(long user) { access(user);return tx.execute(s->jdbc.query("SELECT * FROM skin_sets ORDER BY updated_at DESC,id LIMIT 200",this::row)); }
    public Entry create(long user,Definition input) {
        access(user);var d=validate(input);String id=UUID.randomUUID().toString();
        return tx.execute(s->{checkMembers(d);checkCode(d.productCode());
            jdbc.update("INSERT INTO skin_sets(id,product_code,name,grade,compatibility,image_skin_id) VALUES(?,?,?,?,?,?)",
                    id,d.productCode(),d.name(),d.grade(),d.compatibility(),d.imageSkinId());
            members(id,d.itemIds());return get(id,false);});
    }
    public Entry save(long user,String id,Save request) {
        access(user);SkinRules.id(id);if(request==null) throw SkinException.invalid("세트 정보가 필요합니다.");
        SkinRules.version(request.version());var d=validate(request.definition());
        return tx.execute(s->{Entry e=get(id,true);version(e,request.version());
            if(e.publishedAt()!=null) throw new SkinException(409,"SKIN_SET_IMMUTABLE","공개한 세트 구성은 바꿀 수 없어요. 새 세트로 등록해주세요.");
            if(!e.definition().productCode().equals(d.productCode())) throw SkinException.invalid("세트 코드는 변경할 수 없어요.");
            checkMembers(d);
            jdbc.update("UPDATE skin_sets SET name=?,grade=?,compatibility=?,image_skin_id=?,state_version=state_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
                    d.name(),d.grade(),d.compatibility(),d.imageSkinId(),id);
            jdbc.update("DELETE FROM skin_set_members WHERE set_id=?",id);members(id,d.itemIds());return get(id,false);});
    }
    public Entry publish(long user,String id,long expected) {
        access(user);SkinRules.id(id);SkinRules.version(expected);
        return tx.execute(s->{Entry e=get(id,true);if(e.state().equals("PUBLISHED")) return e;
            version(e,expected);var d=e.definition();var components=checkMembers(d);
            // 구성은 공개 이후 고정된다. 추첨/개봉의 기존 상품→아이템 잠금 순서와 호환된다.
            var found=jdbc.queryForList("SELECT product_code FROM gacha_products WHERE product_code=? FOR UPDATE",String.class,d.productCode());
            if(e.publishedAt()==null) {
                if(!found.isEmpty()) throw new SkinException(409,"SKIN_PRODUCT_CODE_CONFLICT","이미 사용 중인 상품 코드예요.");
                var image=components.stream().filter(i->i.id().equals(d.imageSkinId())).findFirst().orElseThrow();
                jdbc.update("INSERT INTO gacha_products(product_code,name,grade,compatibility,image_key,active) VALUES(?,?,?,?,?,FALSE)",
                        d.productCode(),d.name(),d.grade(),d.compatibility(),"catalog/"+image.publishedUploadId());
                // Existing gacha_product_items has UNIQUE(item_id) for legacy products.
                // New set composition stays in skin_set_members/skin_item_parts so a common
                // component can be reused by male and female products without copying ownership.
            }
            jdbc.update("UPDATE gacha_products SET active=TRUE WHERE product_code=?",d.productCode());
            jdbc.update("UPDATE skin_sets SET state='PUBLISHED',published_at=COALESCE(published_at,CURRENT_TIMESTAMP(3)),state_version=state_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",id);
            return get(id,false);});
    }
    public Entry disable(long user,String id,long expected) {
        access(user);SkinRules.id(id);SkinRules.version(expected);
        return tx.execute(s->{Entry e=get(id,true);version(e,expected);
            if(e.publishedAt()!=null) jdbc.update("UPDATE gacha_products SET active=FALSE WHERE product_code=?",e.definition().productCode());
            jdbc.update("UPDATE skin_sets SET state='DISABLED',state_version=state_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",id);return get(id,false);});
    }
    private static Definition validate(Definition d) {
        if(d==null) throw SkinException.invalid("세트 정보가 필요합니다.");
        // 코드·이름·등급·성별은 기존 등록 계약과 동일하게 검사한다.
        var base=SkinRules.validate(new SkinDtos.Definition(d.productCode(),d.name(),d.grade(),d.compatibility(),"PARTS",List.of("HAIR")));
        if(d.itemIds()==null||d.itemIds().isEmpty()||d.itemIds().size()>3||d.itemIds().stream().distinct().count()!=d.itemIds().size())
            throw SkinException.invalid("서로 다른 구성 아이템을 1~3개 선택해주세요.");
        var ids=d.itemIds().stream().map(SkinRules::id).sorted().toList();SkinRules.id(d.imageSkinId());
        if(!ids.contains(d.imageSkinId())) throw SkinException.invalid("대표 이미지는 구성 아이템에서 선택해주세요.");
        return new Definition(base.productCode(),base.name(),base.grade(),base.compatibility(),d.imageSkinId(),ids);
    }
    private List<SkinDtos.Entry> checkMembers(Definition d) {
        Set<String> slots=new HashSet<>();List<SkinDtos.Entry> result=new ArrayList<>();
        // 모든 경로에서 정렬된 ID 순서로 잠가 두 세트가 아이템을 공유해도 역순 잠금을 피한다.
        for(String id:d.itemIds().stream().sorted().toList()) {
            if(!items.isComponent(id)) throw SkinException.invalid("먼저 등록한 아이템을 선택해주세요.");
            var e=items.get(id,true);
            if(!e.state().equals("PUBLISHED")||e.publishedUploadId()==null||items.componentParts(id).size()!=e.definition().slots().size())
                throw new SkinException(409,"SKIN_ITEM_NOT_READY","구성 아이템을 먼저 검증·공개해주세요.");
            if(!e.definition().compatibility().equals("ANY")&&!e.definition().compatibility().equals(d.compatibility()))
                throw new SkinException(409,"SKIN_SET_CHARACTER_MISMATCH","세트와 구성 아이템의 착용 캐릭터가 다릅니다.");
            for(String slot:e.definition().slots()) if(!slots.add(slot))
                throw new SkinException(409,"SKIN_SET_SLOT_CONFLICT","이미 사용 중인 부위가 겹쳐요. 기존 아이템을 먼저 빼주세요.");
            result.add(e);
        }
        return result;
    }
    private void checkCode(String code) {
        if(jdbc.queryForObject("SELECT COUNT(*) FROM gacha_products WHERE product_code=?",Integer.class,code)>0
                ||jdbc.queryForObject("SELECT COUNT(*) FROM skin_catalog WHERE product_code=?",Integer.class,code)>0)
            throw new SkinException(409,"SKIN_PRODUCT_CODE_CONFLICT","이미 사용 중인 상품 코드예요.");
    }
    private void members(String id,List<String> members) { for(String item:members) jdbc.update("INSERT INTO skin_set_members VALUES(?,?)",id,item); }
    private static void version(Entry e,long version) { if(e.version()!=version) throw new SkinException(409,"SKIN_VERSION_CHANGED","다른 창에서 변경됐어요. 다시 조회해주세요."); }
}
