package com.ssafy.ontop.ai;

import java.security.Principal;
import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class AiFeaturesController {
    private final ObjectProvider<AiFeature> features;
    public AiFeaturesController(ObjectProvider<AiFeature> features){this.features=features;}
    @GetMapping("/api/v1/ai/features")
    public ResponseEntity<Map<String,Boolean>> features(Principal principal){
        member(principal);var result=new LinkedHashMap<String,Boolean>();
        result.put("companions",false);result.put("jokeContest",false);
        features.orderedStream().forEach(feature->{if(result.containsKey(feature.featureKey()))result.put(feature.featureKey(),true);});
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }
    static String member(Principal principal){
        try{long id=principal==null?0:Long.parseLong(principal.getName());if(id<=0)throw new NumberFormatException();return Long.toString(id);}
        catch(NumberFormatException invalid){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);}
    }
}
