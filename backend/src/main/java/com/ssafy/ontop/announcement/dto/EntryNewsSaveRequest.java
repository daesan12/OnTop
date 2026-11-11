package com.ssafy.ontop.announcement.dto;
public record EntryNewsSaveRequest(EntryNewsDraft draft,@io.swagger.v3.oas.annotations.media.Schema(nullable=true) EntryNewsUploadEvidence upload) { }
