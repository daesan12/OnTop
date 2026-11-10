-- 로컬 새 공원 10단계 판정. 기존 판·지급·원장과 (run_id, gate) 유일성은 보존한다.
ALTER TABLE jump_runs
    DROP CHECK ck_jump_runs_gates,
    ADD CONSTRAINT ck_jump_runs_gates CHECK (gates_passed BETWEEN 0 AND 10);

ALTER TABLE jump_gate_rewards
    DROP CHECK ck_jump_gate_rewards_gate,
    ADD CONSTRAINT ck_jump_gate_rewards_gate CHECK (gate BETWEEN 1 AND 10);
