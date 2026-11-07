-- 상품·보유품·보상 규칙은 유지하고, 파일 행과 남녀 착용 연결만 추가한다.
CREATE TABLE skin_models (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    upload_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_name VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    model_bytes BIGINT NOT NULL,
    model_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    CONSTRAINT uk_skin_model_file UNIQUE (upload_id,file_name),
    CONSTRAINT uk_skin_model_upload UNIQUE (upload_id,id),
    CONSTRAINT fk_skin_model_upload FOREIGN KEY (upload_id) REFERENCES skin_uploads(id) ON DELETE CASCADE,
    CONSTRAINT ck_skin_model_file CHECK (file_name IN ('model.glb','female.glb')),
    CONSTRAINT ck_skin_model_size CHECK (model_bytes BETWEEN 20 AND 20971520)
) ENGINE=InnoDB;

CREATE TABLE skin_upload_models (
    upload_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    character_gender VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    model_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (upload_id,character_gender),
    CONSTRAINT fk_skin_model_link FOREIGN KEY (upload_id,model_id) REFERENCES skin_models(upload_id,id) ON DELETE CASCADE,
    CONSTRAINT ck_skin_model_gender CHECK (character_gender IN ('MALE','FEMALE'))
) ENGINE=InnoDB;

-- 기존 모델은 업로드 ID를 모델 ID로 재사용한다. 공용은 같은 파일 행을 양쪽에 연결한다.
INSERT INTO skin_models(id,upload_id,file_name,model_bytes,model_sha256)
SELECT id,id,'model.glb',model_bytes,model_sha256 FROM skin_uploads;

INSERT INTO skin_upload_models(upload_id,character_gender,model_id)
SELECT u.id,'MALE',u.id FROM skin_uploads u JOIN skin_catalog c ON c.id=u.skin_id
WHERE c.compatibility IN ('MALE','ANY');

INSERT INTO skin_upload_models(upload_id,character_gender,model_id)
SELECT u.id,'FEMALE',u.id FROM skin_uploads u JOIN skin_catalog c ON c.id=u.skin_id
WHERE c.compatibility IN ('FEMALE','ANY');
