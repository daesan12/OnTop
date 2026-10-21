CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    login_provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    nickname VARCHAR(8) COLLATE utf8mb4_0900_as_ci NOT NULL,
    character_gender VARCHAR(10) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL,
    deleted_at TIMESTAMP(3) NULL,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uk_users_login_provider_provider_user_id UNIQUE (login_provider, provider_user_id),
    CONSTRAINT uk_users_nickname UNIQUE (nickname),
    CONSTRAINT ck_users_login_provider CHECK (login_provider IN ('SSAFY', 'NAVER')),
    CONSTRAINT ck_users_character_gender CHECK (character_gender IN ('MALE', 'FEMALE'))
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_bin;
