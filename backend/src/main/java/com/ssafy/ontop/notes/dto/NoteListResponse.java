package com.ssafy.ontop.notes.dto;

import java.util.List;

public record NoteListResponse(List<NoteResponse> notes) {
}
