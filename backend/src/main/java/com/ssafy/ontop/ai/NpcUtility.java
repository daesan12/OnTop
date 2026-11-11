package com.ssafy.ontop.ai;

import java.util.LinkedHashMap;
import java.util.Map;

/** Eligibility gates and deterministic utilities choose behavior; randomness only chooses safe goals/rests. */
public final class NpcUtility {
    public record Decision(String action,Map<String,Integer> scores) { }
    private NpcUtility() { }
    public static Decision choose(boolean incident,boolean playing,boolean watching,boolean resting) {
        var scores=new LinkedHashMap<String,Integer>();scores.put("PATROL",10);
        if(resting)scores.put("REST",35);
        if(watching)scores.put("WATCH_OMOK",70);
        if(playing)scores.put("PLAY_OMOK",90);
        if(incident)scores.put("RESPOND",100);
        return new Decision(scores.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow().getKey(),Map.copyOf(scores));
    }
}
