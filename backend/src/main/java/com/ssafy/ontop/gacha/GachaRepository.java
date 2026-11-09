package com.ssafy.ontop.gacha;

import com.ssafy.ontop.gacha.GachaDtos.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

public class GachaRepository {
    private final JdbcTemplate jdbc;
    private static final String[] BOX_COLUMNS = {"first_boxes", "second_boxes", "third_boxes", "fourth_boxes"};
    public GachaRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Every application node uses the shared database clock for the refill gate. */
    public Instant serverNow() {
        return jdbc.queryForObject("SELECT CURRENT_TIMESTAMP(3)", Timestamp.class).toInstant();
    }

    public record Member(String nickname, String gender) { }
    public Member member(long userId, boolean lock) {
        return jdbc.query("SELECT nickname, character_gender FROM users WHERE id=? AND deleted_at IS NULL"
                + (lock ? " FOR SHARE" : ""), (rs, n) -> new Member(rs.getString(1), rs.getString(2)), userId)
                .stream().findFirst().orElseThrow(() -> new GachaException(401, "UNAUTHENTICATED", "활성 회원 로그인이 필요합니다."));
    }
    public Machine machine(boolean lock) {
        return jdbc.query("SELECT * FROM gacha_machine WHERE id=1" + (lock ? " FOR UPDATE" : ""), (rs, n) -> {
            int[] counts = {rs.getInt("first_remaining"), rs.getInt("second_remaining"), rs.getInt("third_remaining"),
                    rs.getInt("fourth_remaining"), rs.getInt("coin_remaining")};
            List<Prize> prizes = new ArrayList<>();
            int total = 0;
            for (int i = 0; i < 5; i++) {
                total += counts[i];
                prizes.add(new Prize(i + 1, GachaRules.initial()[i], counts[i], i < 4 ? GachaRules.value(i + 1) : 20));
            }
            Timestamp refill=rs.getTimestamp("refill_ends_at");
            return new Machine(rs.getString("round_id"), rs.getLong("state_version"), total, List.copyOf(prizes),
                    refill==null?null:refill.toInstant());
        }).stream().findFirst().orElseThrow(() -> new GachaException(503, "GACHA_UNAVAILABLE", "뽑기 기계가 준비되지 않았습니다."));
    }
    public Machine advance(Machine before, int selected, Instant now) {
        int[] counts = before.prizes().stream().mapToInt(Prize::remaining).toArray();
        counts[selected]--;
        long round = Long.parseLong(before.roundId());
        if (selected == 0) { round = Math.addExact(round, 1); counts = GachaRules.initial(); }
        Timestamp deadline=selected==0?Timestamp.from(now.plusMillis(GachaRules.REFILL_MILLIS)):null;
        int changed = jdbc.update("UPDATE gacha_machine SET round_id=?,state_version=?,first_remaining=?,"
                + "second_remaining=?,third_remaining=?,fourth_remaining=?,coin_remaining=?,refill_ends_at=? WHERE id=1 AND state_version=?",
                round, Math.addExact(before.version(), 1), counts[0], counts[1], counts[2], counts[3], counts[4], deadline,before.version());
        if (changed != 1) throw new IllegalStateException("기계 잠금과 버전을 확인하세요.");
        return machine(false);
    }
    public void ensureInventory(long userId) {
        jdbc.update("INSERT INTO gacha_inventory(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=user_id", userId);
    }
    public Inventory inventory(long userId) {
        return jdbc.query("SELECT w.balance,w.reserved_balance,COALESCE(g.tickets,0) tickets,"
                + "COALESCE(g.first_boxes,0) first_boxes,COALESCE(g.second_boxes,0) second_boxes,"
                + "COALESCE(g.third_boxes,0) third_boxes,COALESCE(g.fourth_boxes,0) fourth_boxes "
                + "FROM wallets w LEFT JOIN gacha_inventory g ON g.user_id=w.user_id WHERE w.user_id=?",
                (rs, n) -> new Inventory(rs.getLong("tickets"), List.of(
                        new Box(1,rs.getLong("first_boxes")),new Box(2,rs.getLong("second_boxes")),
                        new Box(3,rs.getLong("third_boxes")),new Box(4,rs.getLong("fourth_boxes"))),
                        rs.getLong("balance"),rs.getLong("balance")-rs.getLong("reserved_balance")), userId)
                .stream().findFirst().orElseThrow(() -> new GachaException(409,"WALLET_NOT_READY","지갑 초기화가 필요합니다."));
    }
    public void ticket(long userId, int delta) {
        int n = jdbc.update("UPDATE gacha_inventory SET tickets=tickets+? WHERE user_id=? AND tickets+?>=0", delta,userId,delta);
        if (n != 1) throw new GachaException(409,"GACHA_NO_TICKET","보유한 뽑기권이 없습니다.");
    }
    public void box(long userId, int grade, int delta) {
        GachaRules.checkGrade(grade);
        String column = BOX_COLUMNS[grade-1]; // SQL 식별자는 요청 원문이 아닌 고정 목록에서만 선택한다.
        int n=jdbc.update("UPDATE gacha_inventory SET "+column+"="+column+"+? WHERE user_id=? AND "+column+"+?>=0",delta,userId,delta);
        if(n!=1) throw new GachaException(409,"GACHA_NO_BOX","해당 등급 상자가 없습니다.");
    }
    public List<Product> products(boolean activeOnly, boolean lock) {
        Map<String,List<Long>> parts = new HashMap<>();
        jdbc.query("SELECT product_code,item_id FROM gacha_product_items ORDER BY product_code,item_id",
                rs -> { parts.computeIfAbsent(rs.getString(1), ignored -> new ArrayList<>()).add(rs.getLong(2)); });
        Map<String,List<Component>> components=new HashMap<>();
        jdbc.query("SELECT s.product_code,c.id,c.name,c.published_upload_id,c.slots FROM skin_sets s JOIN skin_set_members m ON m.set_id=s.id JOIN skin_catalog c ON c.id=m.skin_id ORDER BY s.product_code,c.id",
                rs->{String id=rs.getString(2);var ids=jdbc.queryForList("SELECT item_id FROM skin_item_parts WHERE skin_id=? ORDER BY item_id",Long.class,id);
                    components.computeIfAbsent(rs.getString(1),k->new ArrayList<>()).add(new Component(id,rs.getString(3),"catalog/"+rs.getString(4),ids,List.of(rs.getString(5).split(","))));});
        return jdbc.query("SELECT product_code,name,grade,compatibility,image_key FROM gacha_products"
                +(activeOnly?" WHERE active=TRUE":"")+" ORDER BY product_code"+(lock?" FOR SHARE":""),
                (rs,n)->new Product(rs.getString(1),rs.getString(2),rs.getInt(3),rs.getString(4),rs.getString(5),
                        List.copyOf(parts.getOrDefault(rs.getString(1),List.of())),List.copyOf(components.getOrDefault(rs.getString(1),List.of()))));
    }
    public Map<Long,String> bundles() {
        Map<Long,String> values = new HashMap<>();
        jdbc.query("SELECT p.item_id,p.product_code FROM gacha_product_items p LEFT JOIN skin_sets s ON s.product_code=p.product_code WHERE s.id IS NULL ORDER BY p.product_code,p.item_id", rs -> { values.put(rs.getLong(1),rs.getString(2)); });
        return Map.copyOf(values);
    }
    public List<Long> owned(long userId) {
        return jdbc.query("SELECT item_id FROM user_items WHERE user_id=? AND quantity>0 ORDER BY item_id",
                (rs,n)->rs.getLong(1),userId);
    }
    public void validateProduct(Product product) {
        if(product.itemIds().isEmpty()) throw new GachaException(503,"GACHA_CATALOG_INVALID","의상 상품 구성 확인이 필요합니다.");
        List<String> slots = new ArrayList<>();
        for(long item:product.itemIds()) {
            var itemSlots=jdbc.query("SELECT equip_slot FROM items WHERE id=? AND item_type='EQUIPMENT' FOR SHARE",
                    (rs,n)->rs.getString(1),item);
            if(itemSlots.size()!=1 || itemSlots.getFirst()==null || slots.contains(itemSlots.getFirst()))
                throw new GachaException(503,"GACHA_CATALOG_INVALID","의상 상품 부위가 올바르지 않습니다.");
            slots.add(itemSlots.getFirst());
        }
        // 옷은 UI상 한 부위이나 실제 TOP/BOTTOM/SHOES 모두 지급해야 한다.
        long clothes=slots.stream().filter(s->List.of("TOP","BOTTOM","SHOES").contains(s)).count();
        if(clothes!=0 && clothes!=3) throw new GachaException(503,"GACHA_CATALOG_INVALID","옷 한 벌의 구성이 누락되었습니다.");
    }
    public void grant(long userId, Product product) {
        for(long item:product.itemIds()) jdbc.update("INSERT INTO user_items(user_id,item_id,quantity,is_equipped) "
                +"VALUES(?,?,1,FALSE) ON DUPLICATE KEY UPDATE quantity=GREATEST(quantity,1)",userId,item);
    }
    public record Saved(String kind, String target, String json) { }
    public Optional<Saved> receipt(long userId,String key) {
        return jdbc.query("SELECT operation_kind,operation_target,result_json FROM gacha_receipts WHERE user_id=? AND operation_id=?",
                (rs,n)->new Saved(rs.getString(1),rs.getString(2),rs.getString(3)),userId,key).stream().findFirst();
    }
    public void receipt(long userId,String key,String kind,String target,String json,Instant now) {
        jdbc.update("INSERT INTO gacha_receipts VALUES(?,?,?,?,?,?)",userId,key,kind,target,json,Timestamp.from(now));
    }
    public void event(String eventId,String json,Instant now) {
        jdbc.update("INSERT INTO gacha_events(event_id,payload,created_at) VALUES(?,?,?)",eventId,json,Timestamp.from(now));
    }
    public record Delivery(long id,String json) { }
    public void ensureCursor(String node) {
        jdbc.update("INSERT INTO gacha_delivery_cursors(node_id,last_event_id) "
                +"SELECT ?,COALESCE(MAX(id),0) FROM gacha_events ON DUPLICATE KEY UPDATE node_id=node_id",node);
    }
    public List<Delivery> deliveries(String node) {
        return jdbc.query("SELECT e.id,e.payload FROM gacha_events e JOIN gacha_delivery_cursors c ON c.node_id=? "
                +"WHERE e.id>c.last_event_id ORDER BY e.id LIMIT 50",(rs,n)->new Delivery(rs.getLong(1),rs.getString(2)),node);
    }
    public void acknowledge(String node,long id) {
        jdbc.update("UPDATE gacha_delivery_cursors SET last_event_id=GREATEST(last_event_id,?) WHERE node_id=?",id,node);
    }
}
