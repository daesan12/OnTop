package com.ssafy.ontop.ai;

import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.*;
import java.util.function.Supplier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Tag(name="AI")
@SecurityRequirement(name="AccessJwt")
@RestController
@RequestMapping("/api/v1/ai/joke-contest")
public class JokeContestController {
    private final ObjectProvider<LocalJokeContest> contests;
    private final ObjectProvider<WorldChannelRegistry> channels;
    private final ObjectProvider<JokeJudgeLocation> maps;
    private final ObjectProvider<TableHub> hubs;
    public JokeContestController(ObjectProvider<LocalJokeContest> contests,ObjectProvider<WorldChannelRegistry> channels,
            ObjectProvider<JokeJudgeLocation> maps,ObjectProvider<TableHub> hubs){this.contests=contests;this.channels=channels;this.maps=maps;this.hubs=hubs;}
    private LocalJokeContest service(){var c=contests.getIfAvailable();if(c==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"아재왕 대회가 쉬고 있어요.");return c;}
    @Operation(summary="내 오늘 아재왕 도전 기록 조회")
    @GetMapping("/me") public ResponseEntity<?> mine(Principal p){String owner=AiFeaturesController.member(p);return result(()->service().mine(owner));}
    @Operation(summary="내 아재왕 제출 결과 조회")
    @GetMapping("/submissions/{id}") public ResponseEntity<?> own(Principal p,@PathVariable String id){String owner=AiFeaturesController.member(p);return result(()->service().own(owner,id));}
    @Operation(summary="날짜별 아재왕 순위 조회")
    @GetMapping("/rankings") public ResponseEntity<?> rankings(Principal p,@RequestParam(required=false) String date){AiFeaturesController.member(p);return result(()->service().rankings(date==null?LocalDate.now(ZoneId.of("Asia/Seoul")).toString():date));}
    @Operation(summary="역대 아재왕 조회")
    @GetMapping("/hall") public ResponseEntity<?> hall(Principal p){AiFeaturesController.member(p);return result(()->service().hall());}
    @Operation(summary="어제 아재왕 조회")
    @GetMapping("/yesterday") public ResponseEntity<?> yesterday(Principal p){AiFeaturesController.member(p);return result(()->service().yesterday());}
    @Operation(summary="상위 아재왕 작품 정답 조회",operationId="revealJokeContestAnswer")
    @GetMapping("/reveal/{id}") public ResponseEntity<?> reveal(Principal p,@PathVariable String id){AiFeaturesController.member(p);return result(()->service().reveal(id));}
    public record Submit(String question,String answer,String idempotencyKey,boolean consent){}
    @Operation(summary="아재개그 문제와 정답 제출",description="김부장 근처의 실제 공원 이용자만 제출합니다. 작성자와 닉네임은 서버에서 확인하며 하루 3회·중복 요청·실패 기회 반환 정책을 적용합니다.")
    @PostMapping("/submissions") public ResponseEntity<?> submit(Principal p,@RequestBody Submit body){
        String owner=AiFeaturesController.member(p);var contest=service();
        var registry=channels.getIfAvailable();String channel=registry==null?null:registry.channelOf(owner);
        var position=registry==null?null:registry.positionOf(owner);var map=maps.getIfAvailable();var hub=hubs.getIfAvailable();
        var anchor=map;
        if(channel==null||position==null||anchor==null||hub==null||!hub.aiActors().getOrDefault(channel,java.util.Map.of()).containsKey(owner)
                ||Math.hypot(position.x()-anchor.x(),position.z()-anchor.z())>3||Math.abs(position.y()-anchor.y())>1.6)
            return ResponseEntity.status(HttpStatus.FORBIDDEN).cacheControl(CacheControl.noStore()).body(java.util.Map.of("code","JOKE_OUT_OF_RANGE","message","김부장 가까이에서 제출해주세요."));
        String nickname=registry.worldState(channel).avatars().stream().filter(a->a.userId().equals(owner)).map(a->a.nickname()).filter(n->n!=null&&!n.isBlank()).findFirst().orElse("주민");
        return result(()->contest.submit(owner,nickname,body.question(),body.answer(),body.idempotencyKey(),body.consent()));
    }
    private ResponseEntity<?> result(Supplier<?> request){try{return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(request.get());}
        catch(IllegalArgumentException|java.time.format.DateTimeParseException invalid){return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(java.util.Map.of("message",invalid.getMessage()==null?"입력을 확인해주세요.":invalid.getMessage()));}}
}
