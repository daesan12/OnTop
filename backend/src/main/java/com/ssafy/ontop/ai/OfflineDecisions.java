package com.ssafy.ontop.ai;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;

/** Deliberately small deterministic fixture. This is NOT Jev or a production Korean moderation model. */
public final class OfflineDecisions implements AiDecisions {
    @Override public ConflictAssessment assessConflict(List<Chat> context,List<Chat> targets,long now) {
        var recent=context.stream().filter(c->c.sentAt()>=now-30_000&&c.sentAt()<=now+1000).toList();
        var pending=targets.stream().filter(t->recent.stream().anyMatch(c->c.id().equals(t.id()))).toList();
        var flagged=pending.stream().filter(c->c.text().matches(".*(ㅈ같|좆같|그따위|그따구|너 나가|왜 시비|싸우자).*"))
                .filter(c->!c.text().matches(".*[\"“”'‘’].*")).map(Chat::id).toList();
        return new ConflictAssessment("OFFLINE_RULE_FIXTURE",flagged.isEmpty()?0:1,.85,!flagged.isEmpty(),now,recent.stream().map(Chat::id).toList(),
                flagged.isEmpty()?pending.stream().map(Chat::id).toList():flagged,"FIXTURE_NEGATIVITY","negative-advisory-v2");
    }
    @Override
    public Moderation moderate(List<Chat> context, List<Chat> targets) {
        var results = new LinkedHashMap<String, Verdict>();
        for (var chat : targets) {
            String text = chat.text().toLowerCase(Locale.ROOT);
            boolean quote = contains(text, "욕하지", "욕설", "라고 했", "쓰지 마", "쓰지마", "예시", "인용");
            results.put(chat.id(), quote ? Verdict.UNCERTAIN
                    : contains(text, "씨발", "시발", "개새끼", "병신", "죽여버") ? Verdict.VIOLATION : Verdict.NORMAL);
        }
        long speakers = context.stream().filter(c -> contains(c.text(), "너 나가", "왜 시비", "그만해", "왜 그래", "싸우자"))
                .map(Chat::author).distinct().count();
        return new Moderation(results, speakers >= 2, "OFFLINE_RULE_FIXTURE");
    }

    @Override
    public Triage triage(String text) {
        boolean bug = contains(text, "안 돼", "안돼", "안됨", "안움직", "안 움직", "불가", "멈", "오류", "장애");
        int severity = bug ? contains(text, "전체", "모두", "전원") ? 0
                : contains(text, "로그인", "접속", "턴", "이동", "안 움직", "안움직") ? 1 : 2 : 3;
        String area = contains(text, "이동", "움직") ? "MOVEMENT" : contains(text, "로그인", "접속") ? "AUTH"
                : contains(text, "게임", "오목", "턴") ? "GAME" : "OTHER";
        return new Triage(bug ? "BUG" : "SUGGESTION", area, severity, "OFFLINE_RULE_FIXTURE");
    }

    private static boolean contains(String text, String... words) {
        for (String word : words) if (text.contains(word)) return true;
        return false;
    }
}
