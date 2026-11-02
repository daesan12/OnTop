package com.ssafy.ontop.notes.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 전 채널 공용 게시판의 동시 작성·120장 정리를 직렬화하는 단일 행. */
@Entity
@Table(name = "anonymous_note_board")
public class NoteBoard {
    @Id
    private Long id;
    @jakarta.persistence.Column(nullable = false)
    private long revision;

    protected NoteBoard() {
    }
}
