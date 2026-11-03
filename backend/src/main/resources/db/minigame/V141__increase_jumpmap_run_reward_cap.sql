-- 점프맵 7구간 보상 합계를 250냥으로 상향한다. 미니게임 공통 KST 일일 상한 500냥은 유지한다.
ALTER TABLE jump_runs
    DROP CHECK ck_jump_runs_coins,
    ADD CONSTRAINT ck_jump_runs_coins CHECK (coins_granted BETWEEN 0 AND 250);
