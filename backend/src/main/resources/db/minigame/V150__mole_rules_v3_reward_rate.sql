-- 두더지 잡기 규칙 3(S15P31B105-342): 망치 하나 제한을 빼면서 40점당 1냥으로 바꾼다. 이미 정산한 판은 그 판의 규칙 비율을 유지한다.
ALTER TABLE mole_rounds
    DROP CHECK ck_mole_status,
    ADD CONSTRAINT ck_mole_status CHECK ((status = 'ACTIVE' AND settled_at IS NULL AND score IS NULL AND reward IS NULL)
        OR (status = 'EXPIRED' AND settled_at IS NOT NULL AND score IS NULL AND reward IS NULL)
        OR (status = 'SETTLED' AND settled_at IS NOT NULL AND score >= 0 AND max_combo >= 0 AND caught >= 0
            AND calculated_reward = score DIV (CASE rules_version WHEN 1 THEN 30 WHEN 2 THEN 45 ELSE 40 END)
            AND reward BETWEEN 0 AND calculated_reward));
