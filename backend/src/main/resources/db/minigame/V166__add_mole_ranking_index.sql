-- 두더지 잡기 전체 랭킹과 공원 랭킹판이 현재 규칙의 정산 판에서 회원별 최고 기록을 고른다.
-- 스피드 두더지(ix_speed_mole_bests)와 같은 모양으로 규칙·상태로 좁힌 뒤 회원별 정렬 값을 인덱스에서 읽는다. 데이터는 바꾸지 않는다.
CREATE INDEX ix_mole_bests ON mole_rounds (rules_version, status, user_id, score, max_combo, settled_at);
