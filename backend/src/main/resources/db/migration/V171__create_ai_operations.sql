-- AI workflow history and durable outbox. V170 must precede this migration.
CREATE TABLE ai_chat_messages (
 id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 sequence_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 scope VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 processed BOOLEAN NOT NULL,
 sent_at BIGINT NOT NULL,
 payload JSON NOT NULL,
 UNIQUE KEY uk_ai_chat_sequence (sequence_id),
 INDEX ix_ai_chat_pending (processed, sent_at, sequence_id),
 INDEX ix_ai_chat_scope (scope, processed, sent_at, sequence_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE ai_chat_assessments (
 message_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 kind VARCHAR(16) NOT NULL,
 payload JSON NOT NULL,
 PRIMARY KEY (message_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE ai_feedback_reports (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 author VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 operation_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 state VARCHAR(20) NOT NULL,
 created_at BIGINT NOT NULL,
 payload JSON NOT NULL,
 UNIQUE KEY uk_ai_feedback_operation (author, operation_id),
 INDEX ix_ai_feedback_work (state, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE ai_incidents (
 id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 scope VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 state VARCHAR(20) NOT NULL,
 next_attempt_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 payload JSON NOT NULL,
 INDEX ix_ai_incident_work (state, next_attempt_at, id),
 INDEX ix_ai_incident_scope (scope, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE ai_incident_messages (
 incident_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 message_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (incident_id, message_id),
 INDEX ix_ai_incident_message (message_id, incident_id),
 CONSTRAINT fk_ai_incident_message_case FOREIGN KEY (incident_id) REFERENCES ai_incidents(id),
 CONSTRAINT fk_ai_incident_message_chat FOREIGN KEY (message_id) REFERENCES ai_chat_messages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE ai_notice_outbox (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 operation_key VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
 state VARCHAR(16) NOT NULL,
 next_attempt_at BIGINT NOT NULL,
 sent_at BIGINT NOT NULL,
 payload JSON NOT NULL,
 UNIQUE KEY uk_ai_notice_operation (operation_key),
 INDEX ix_ai_notice_work (state, next_attempt_at, id),
 INDEX ix_ai_notice_sent (sent_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE ai_runtime_state (
 id TINYINT NOT NULL PRIMARY KEY,
 digest_slot VARCHAR(64) NOT NULL,
 CONSTRAINT ck_ai_runtime_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
INSERT INTO ai_runtime_state (id, digest_slot) VALUES (1, '');
