package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Tag(name="AI")
@SecurityRequirement(name="AccessJwt")
@RestController
@RequestMapping("/api/v1/ai/companions")
public class ResidentController {
    private final ObjectProvider<LocalCompanions> companions;private final ObjectProvider<WorldChannelRegistry> registries;
    public ResidentController(ObjectProvider<LocalCompanions> companions,ObjectProvider<WorldChannelRegistry> registries){this.companions=companions;this.registries=registries;}
    @Operation(summary="내 주민 오목 상태 조회")
    @GetMapping("/status") public ResponseEntity<Map<String,Object>> status(Principal p){String owner=member(p);return result(()->service().status(owner,registries.getObject().channelOf(owner)));}
    public record Invite(String difficulty){}
    public record Talk(String persona,String question){}
    @Operation(summary="난이도별 오목 주민 초대")
    @PostMapping("/invite") public ResponseEntity<Map<String,Object>> invite(Principal p,@RequestBody Invite body){String owner=member(p);return result(()->service().invite(owner,LocalCompanions.Difficulty.valueOf(body.difficulty()==null?"NORMAL":body.difficulty())));}
    @Operation(summary="내 주민 오목 경기 행동")
    @PostMapping("/action") public ResponseEntity<Map<String,Object>> action(Principal p,@RequestBody JsonNode body){String owner=member(p);return result(()->service().action(owner,body));}
    @Operation(summary="주민에게 질문하기")
    @PostMapping("/talk") public ResponseEntity<Map<String,Object>> talk(Principal p,@RequestBody Talk body){String owner=member(p);if(body.persona()==null||body.question()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"주민과 질문을 확인해주세요.");return result(()->service().talk(owner,body.persona(),body.question()));}
    private String member(Principal p){String owner=AiFeaturesController.member(p);var channels=registries.getIfAvailable();if(channels==null||channels.channelOf(owner)==null)throw new ResponseStatusException(HttpStatus.CONFLICT,"먼저 공원에 입장해주세요.");return owner;}
    private LocalCompanions service(){var value=companions.getIfAvailable();if(value==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"주민 기능이 꺼져 있어요.");return value;}
    private <T>ResponseEntity<T> result(Supplier<T> action){try{return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(action.get());}catch(IllegalArgumentException invalid){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,invalid.getMessage());}}
}
