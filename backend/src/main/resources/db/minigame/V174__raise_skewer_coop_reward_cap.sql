-- 미니게임 공통 KST 하루 상한을 500냥에서 1000냥으로 올린다. 꼬치 협동 한 판 지급 상한도 같은 값으로 맞춘다.
ALTER TABLE skewer_coop_rewards
    DROP CHECK ck_skewer_coop_reward_amount,
    ADD CONSTRAINT ck_skewer_coop_reward_amount CHECK (
        coins_calculated >= 0 AND coins_granted >= 0 AND coins_granted <= coins_calculated
        AND coins_granted <= 1000 AND earned_at_settlement >= coins_granted AND balance_after >= 0);
