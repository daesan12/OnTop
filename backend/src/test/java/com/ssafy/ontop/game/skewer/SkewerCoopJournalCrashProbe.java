package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.skewer.coop.repository.SkewerCoopResultJournal;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import java.nio.file.Path;

/** 종료 훅 없이 별도 JVM을 종료해 DB 저장 전 저널의 프로세스 재시작 복구를 검증한다. */
public final class SkewerCoopJournalCrashProbe {
    public static void main(String[] args) throws Exception {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        var result = mapper.readValue(Path.of(args[1]).toFile(), SkewerCoopFinished.class);
        var journal = new SkewerCoopResultJournal(Path.of(args[0]), mapper);
        journal.append(result);
        Runtime.getRuntime().halt(0);
    }
}
