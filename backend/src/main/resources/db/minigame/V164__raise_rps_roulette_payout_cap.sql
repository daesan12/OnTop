-- 가위바위보 룰렛 도전 배수를 ×1.0/×1.5/×2.0에서 ×1.0/×2.0/×4.0으로 올린다. 최대 지급은 30냥 × 10칸 × 4.0 = 1200냥이다.
ALTER TABLE rps_roulette_rounds
    DROP CHECK ck_rps_roulette_payout,
    ADD CONSTRAINT ck_rps_roulette_payout CHECK (payout BETWEEN 0 AND 1200);
