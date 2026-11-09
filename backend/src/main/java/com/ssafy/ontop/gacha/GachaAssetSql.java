package com.ssafy.ontop.gacha;

/** 구성 아이템 전체를 보유한 상품만 한 번 평가한다. 판매가·수량·부위 수는 곱하지 않는다. */
public final class GachaAssetSql {
    private GachaAssetSql() { }
    /** Legacy one-product links and reusable registered components share one effective relation. */
    public static final String PRODUCT_ITEMS = """
            SELECT product_code,item_id FROM gacha_product_items
            UNION
            SELECT s.product_code,p.item_id
            FROM skin_sets s
            JOIN skin_set_members m ON m.set_id=s.id
            JOIN skin_item_parts p ON p.skin_id=m.skin_id
            WHERE s.published_at IS NOT NULL
            """;
    public static final String JOIN = """
            LEFT JOIN (
                SELECT ownership.user_id,
                       SUM(CASE p.grade WHEN 1 THEN 1000 WHEN 2 THEN 500 WHEN 3 THEN 250 WHEN 4 THEN 100 END) equipment_value
                FROM gacha_products p
                JOIN (
                    SELECT ui.user_id, pi.product_code
                    FROM (%s) pi
                    JOIN user_items ui ON ui.item_id=pi.item_id AND ui.quantity>0
                    GROUP BY ui.user_id, pi.product_code
                    HAVING COUNT(*)=(SELECT COUNT(*) FROM (%s) required_items
                                     WHERE required_items.product_code=pi.product_code)
                ) ownership ON ownership.product_code=p.product_code
                GROUP BY ownership.user_id
            ) ga ON ga.user_id=w.user_id
            """.formatted(PRODUCT_ITEMS,PRODUCT_ITEMS);
}
