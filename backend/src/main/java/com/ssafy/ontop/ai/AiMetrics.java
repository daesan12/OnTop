package com.ssafy.ontop.ai;

import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Process-local numeric observations only. Never accepts prompts, identities or credentials. */
public final class AiMetrics {
    private final ConcurrentHashMap<String,AtomicLong> values=new ConcurrentHashMap<>();
    public void add(String name,long amount){values.computeIfAbsent(name,k->new AtomicLong()).addAndGet(amount);}
    public void increment(String name){add(name,1);}
    public void duration(String stage,long nanos){
        long micros=Math.max(0,nanos/1000);
        increment(stage+".samples");add(stage+".total_us",micros);
        values.computeIfAbsent(stage+".max_us",k->new AtomicLong()).accumulateAndGet(micros,Math::max);
    }
    public Map<String,Long> snapshot(){var result=new TreeMap<String,Long>();values.forEach((k,v)->result.put(k,v.get()));return Map.copyOf(result);}
}
