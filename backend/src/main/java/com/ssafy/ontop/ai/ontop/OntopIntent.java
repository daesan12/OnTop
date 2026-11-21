package com.ssafy.ontop.ai.ontop;

import java.util.concurrent.CompletableFuture;

public enum OntopIntent {
    GREET, INVITE, ACCEPT, STOP, CLOSE, RULES, STATUS, THANKS, TAUNT, OTHER;

    public record Decision(OntopIntent intent, String source) {
    }

    @FunctionalInterface
    public interface Chooser {
        CompletableFuture<Decision> choose(String text, boolean invited, boolean playing);
    }

    public static OntopIntent local(String text, boolean invited) {
        String compact = text.replaceAll("\\s+", "");
        if (compact.equals("종료") || compact.equals("대화종료")) {
            return CLOSE;
        }
        if (compact.matches(".*(그만|중단|취소|안할|싫어|멈춰).*")) {
            return STOP;
        }
        if (compact.matches(".*(규칙|방법|어떻게|조작|도움말).*")) {
            return RULES;
        }
        if (compact.matches(".*(눈싸움|같이놀|함께놀|한판).*")) {
            return INVITE;
        }
        if (invited && compact.matches("(응|네|좋아|시작|수락|하자|그래|오케이|ㅇㅇ)[!?.~]*")) {
            return ACCEPT;
        }
        if (compact.matches(".*(고마|감사|수고).*")) {
            return THANKS;
        }
        if (compact.matches(".*(안녕|반가|누구|이름).*")) {
            return GREET;
        }
        if (compact.matches(".*(잘해|이길|못하|덤벼|실력).*")) {
            return TAUNT;
        }
        if (compact.matches(".*(어디|뭐해|상태|바빠).*")) {
            return STATUS;
        }
        return OTHER;
    }

    public static Chooser offline() {
        return (text, invited, playing) -> CompletableFuture.completedFuture(
                new Decision(local(text, invited), "LOCAL_RULES"));
    }
}
