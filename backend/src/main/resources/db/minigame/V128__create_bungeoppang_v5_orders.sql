-- 붕어빵 v5 Story 252: 활성 손님 3자리의 발급 주문 이력을 저장한다.
-- v5 판 원본·시간·checkpoint·영수증은 rules_version='v5' 기록과 함께 기존 bungeoppang_v4_rounds 계열을 재사용한다.
-- v4 주문 테이블과 v4 데이터는 변경하지 않는다.
CREATE TABLE bungeoppang_v5_orders (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    minigame_session_id BIGINT NOT NULL,
    -- 판 안의 발급 순번. JSON에서는 십진수 문자열로 반환한다.
    order_id BIGINT NOT NULL,
    customer_slot INT NOT NULL,
    -- 0은 시작 주문, s > 0은 seq s의 승인된 DELIVER가 비운 자리의 충원 주문이다.
    available_after_seq INT NOT NULL,
    bean INT NOT NULL,
    custard INT NOT NULL,
    pizza INT NOT NULL,
    chocolate INT NOT NULL,
    issued_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT uk_bungeoppang_v5_order_id UNIQUE (minigame_session_id, order_id),
    -- 같은 시점에 같은 손님 자리를 두 번 채우지 않는다. 시작 주문 3건의 자리 중복도 막는다.
    CONSTRAINT uk_bungeoppang_v5_order_slot UNIQUE (minigame_session_id, available_after_seq, customer_slot),
    CONSTRAINT fk_bungeoppang_v5_order_round FOREIGN KEY (minigame_session_id)
        REFERENCES bungeoppang_v4_rounds(minigame_session_id),
    CONSTRAINT ck_bungeoppang_v5_order_identity CHECK (
        order_id > 0 AND customer_slot BETWEEN 0 AND 2 AND available_after_seq BETWEEN 0 AND 3600
    ),
    CONSTRAINT ck_bungeoppang_v5_order_counts CHECK (
        bean >= 0 AND custard >= 0 AND pizza >= 0 AND chocolate >= 0
        AND bean + custard + pizza + chocolate BETWEEN 1 AND 4
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
