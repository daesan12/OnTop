package com.ssafy.ontop.gacha;

/** 구성 아이템 전체를 보유한 상품만 한 번 평가한다. 판매가·수량·부위 수는 곱하지 않고, 구성 아이템이 같은 상품(남녀 세트)은 하나로 본다. */
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
    /**
     * Owned value per user. Products whose items are exactly the same (one design published as a male and a female set)
     * are one design: the user owns it once, so it is valued once, at its highest grade.
     */
    public static final String JOIN = """
            LEFT JOIN (
                SELECT owned.user_id, SUM(owned.design_value) equipment_value
                FROM (
                    SELECT ownership.user_id, designs.signature,
                           MAX(CASE p.grade WHEN 1 THEN 1000 WHEN 2 THEN 500 WHEN 3 THEN 250 WHEN 4 THEN 100 END) design_value
                    FROM gacha_products p
                    JOIN (
                        SELECT ui.user_id, pi.product_code
                        FROM (
                            SELECT product_code,item_id,COUNT(*) OVER (PARTITION BY product_code) required_count
                            FROM (%1$s) product_items
                        ) pi
                        JOIN user_items ui ON ui.item_id=pi.item_id AND ui.quantity>0
                        GROUP BY ui.user_id, pi.product_code
                        HAVING COUNT(*)=MAX(pi.required_count)
                    ) ownership ON ownership.product_code=p.product_code
                    JOIN (
                        SELECT product_code, GROUP_CONCAT(item_id ORDER BY item_id SEPARATOR ',') signature
                        FROM (%1$s) design_items
                        GROUP BY product_code
                    ) designs ON designs.product_code=p.product_code
                    GROUP BY ownership.user_id, designs.signature
                ) owned
                GROUP BY owned.user_id
            ) ga ON ga.user_id=w.user_id
            """.formatted(PRODUCT_ITEMS);
}
