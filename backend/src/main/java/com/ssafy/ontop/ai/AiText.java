package com.ssafy.ontop.ai;

/** The caller supplies a truthful fallback; no provider is required for local execution. */
public interface AiText {
    int MAX_FACTS_CHARACTERS=12_000;
    record Reply(String text, String source) { }
    Reply generate(String persona, String facts, String fallback);
    default String mode() { return "FIXED"; }
    default java.util.Map<String,Long> usage() { return java.util.Map.of("calls",0L,"failures",0L); }

    static AiText fixed() { return (persona, facts, fallback) -> new Reply(fallback, "FIXED"); }
}
