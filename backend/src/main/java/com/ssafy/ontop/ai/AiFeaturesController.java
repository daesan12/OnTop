package com.ssafy.ontop.ai;

import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Tag(name="AI")
@SecurityRequirement(name="AccessJwt")
@RestController
public class AiFeaturesController {
    private final ObjectProvider<AiFeature> features;
    public AiFeaturesController(ObjectProvider<AiFeature> features){this.features=features;}
    @Operation(summary="활성화된 AI 기능 조회",description="로그인한 회원에게 실제 초기화된 주민·아재왕 기능을 반환합니다. 비활성 기능은 false이며 비밀 설정은 포함하지 않습니다.")
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
