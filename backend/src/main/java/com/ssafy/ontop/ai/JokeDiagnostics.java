package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;
import org.slf4j.LoggerFactory;

/** Opt-in server diagnostics. Never added to public submissions or ranking responses. */
public final class JokeDiagnostics implements AutoCloseable {
    private static final ThreadLocal<JokeDiagnostics> CURRENT = new ThreadLocal<>();
    private final JokeDiagnostics previous;
    private final String id;
    private final Consumer<Map<String,Object>> sink;
    private JokeDiagnostics(String id, Consumer<Map<String,Object>> sink) {
        this.id=id;this.sink=sink;previous=CURRENT.get();CURRENT.set(this);
    }
    public static JokeDiagnostics open(String id,Consumer<Map<String,Object>> sink){return new JokeDiagnostics(id,sink);}
    public static Consumer<Map<String,Object>> configuredLogging(ObjectMapper mapper){
        if(!Boolean.parseBoolean(System.getenv().getOrDefault("AI_JOKE_DIAGNOSTICS_ENABLED","false")))return event->{};
        var log=LoggerFactory.getLogger(JokeDiagnostics.class);
        return event->{try{log.info("joke_diagnostic {}",mapper.writeValueAsString(event));}catch(Exception ignored){/* Logging must not change rewards. */}};
    }
    public static void emit(String stage,Map<String,?> values){
        var trace=CURRENT.get();if(trace==null)return;
        var event=new LinkedHashMap<String,Object>();event.put("schema",1);event.put("submissionId",trace.id);event.put("stage",stage);
        event.putAll(values);
        try{trace.sink.accept(java.util.Collections.unmodifiableMap(event));}catch(RuntimeException ignored){/* Diagnostics are best effort. */}
    }
    public static String text(String value){
        if(value==null)return "";
        // Defense in depth for generated content; no request headers or API secrets are recorded.
        String redacted=value.replaceAll("(?i)(?:sk-[a-z0-9_-]{8,}|Bearer\\s+[a-z0-9._-]+)","[REDACTED]");
        return redacted.length()<=8192?redacted:redacted.substring(0,8192)+"[TRUNCATED]";
    }
    @Override public void close(){if(previous==null)CURRENT.remove();else CURRENT.set(previous);}
}
