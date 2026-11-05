-- 두더지 잡기 규칙 2(S15P31B105-340): 두더지가 늘어 45점당 1냥으로 바꾼다. 이미 정산한 규칙 1 판은 30점당 1냥 그대로 둔다.
ALTER TABLE mole_rounds
    DROP CHECK ck_mole_status,
    ADD CONSTRAINT ck_mole_status CHECK ((status = 'ACTIVE' AND settled_at IS NULL AND score IS NULL AND reward IS NULL)
        OR (status = 'EXPIRED' AND settled_at IS NOT NULL AND score IS NULL AND reward IS NULL)
        OR (status = 'SETTLED' AND settled_at IS NOT NULL AND score >= 0 AND max_combo >= 0 AND caught >= 0
            AND calculated_reward = score DIV (CASE rules_version WHEN 1 THEN 30 ELSE 45 END)
            AND reward BETWEEN 0 AND calculated_reward));
