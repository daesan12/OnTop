package com.ssafy.ontop.ai;

import java.util.*;

/** Preserve assignments while eligible. A physical resident watches one table; each table has at most two. */
public final class OmokCrowd {
    private OmokCrowd() { }
    public static Map<String,String> assign(Map<String,String> previous,List<String> residents,List<String> games) {
        var result=new LinkedHashMap<String,String>();var counts=new HashMap<String,Integer>();
        for(String resident:residents){String target=previous.get(resident);if(target!=null&&games.contains(target)&&counts.getOrDefault(target,0)<2){result.put(resident,target);counts.merge(target,1,Integer::sum);}}
        for(String resident:residents)if(!result.containsKey(resident))games.stream().filter(id->counts.getOrDefault(id,0)<2)
                .min(Comparator.comparingInt(id->counts.getOrDefault(id,0))).ifPresent(id->{result.put(resident,id);counts.merge(id,1,Integer::sum);});
        return Map.copyOf(result);
    }
}
