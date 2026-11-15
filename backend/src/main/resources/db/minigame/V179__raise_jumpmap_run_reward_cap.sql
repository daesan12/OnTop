-- 220m 돌탑 점프맵의 한 바퀴 보상 합계를 500냥으로 상향한다.
ALTER TABLE jump_runs
    DROP CHECK ck_jump_runs_coins,
    ADD CONSTRAINT ck_jump_runs_coins CHECK (coins_granted BETWEEN 0 AND 500);
