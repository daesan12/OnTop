package com.ssafy.ontop.world.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpRun;
import com.ssafy.ontop.world.jumpmap.JumpmapService;
import com.ssafy.ontop.world.jumpmap.JumpmapStore;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 돌탑 점프맵 상태·말풍선(FE 연동 계약 2장). 지급·판정 API는 없다. 비활성이면 enabled=false로 응답한다. */
@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequestMapping("/api/v1/minigames/jumpmap")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
public class JumpmapController {
    private final JumpmapService service;
    private final WorldChannelRegistry channels;

    public JumpmapController(JumpmapService service, WorldChannelRegistry channels) {
        this.service = service;
        this.channels = channels;
    }

    @GetMapping("/status")
    @Operation(summary = "점프맵 상태", description = "activeRun은 요청 채널에 있을 때만, lastRun은 최근 종료 판을 잠시만 담는다.")
    public ResponseEntity<Map<String, Object>> status(Principal principal, @RequestParam String channelId) {
        String userId = Long.toString(account(principal));
        if (channelId.isBlank() || channelId.length() > 64) {
            throw new JumpmapRequestException(400, "INVALID_REQUEST", "채널을 확인해주세요.");
        }
        // 다른 탭·채널의 진행 판을 섞지 않는다. 사용자가 그 채널에 있을 때만 진행 판을 싣는다.
        var view = service.status(userId, () -> channelId.equals(channels.channelOf(userId))
                ? channels.jumpmapRun(userId) : Optional.empty());
        var body = new LinkedHashMap<String, Object>();
        body.put("channelId", channelId);
        body.put("mapVersion", channels.mapMetadata().mapVersion());
        body.put("revision", view.revision());
        body.put("enabled", view.enabled());
        body.put("courseVersion", JumpCourse.COURSE_VERSION);
        body.put("rulesVersion", JumpCourse.RULES_VERSION);
        body.put("isFirstRun", view.firstRun());
        body.put("seenTips", view.seenTips());
        body.put("activeRunId", view.activeRunId());
        body.put("activeRun", view.activeRun());
        body.put("todayEarned", view.todayEarned());
        body.put("dailyCap", JumpmapStore.DAILY_CAP);
        body.put("earningsDate", view.today().toString());
        body.put("bestFinishMs", view.bestFinishMs());
        var last = view.lastRun();
        if (last != null && last.channelId().equals(channelId)) {
            var run = new LinkedHashMap<String, Object>();
            run.put("runId", last.runId());
            run.put("elapsedMs", last.elapsedMs());
            run.put("gatesPassed", last.gatesPassed());
            run.put("finalReached", last.reason() == JumpRun.EndReason.FINISH);
            run.put("maxHeight", last.maxHeight());
            run.put("runCoins", last.runCoins());
            run.put("reason", last.reason().name());
            if (last.reason() == JumpRun.EndReason.FINISH) {
                run.put("finishMs", last.finishMs());
                run.put("bestFinishMs", last.bestFinishMs());
                run.put("newBest", last.newBest());
            }
            body.put("lastRun", run);
        } else {
            body.put("lastRun", null);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("/rankings")
    @Operation(summary = "돌탑 점프맵 타임어택 랭킹", description = "현 규칙의 검증된 개인 최고 기록 상위 50명과 내 기록. 동점은 같은 등수, 먼저 도착한 기록이 먼저 표시된다.")
    public ResponseEntity<JumpmapStore.Ranking> rankings(Principal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.ranking(account(principal)));
    }

    @PostMapping("/tips")
    @Operation(summary = "본 말풍선 저장", description = "모르는 키는 버리고 기존 목록과 합친다.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "저장됨")
    public ResponseEntity<Void> tips(Principal principal, @RequestBody JsonNode body) {
        long userId = account(principal);
        if (body == null || !body.isObject() || body.size() != 1 || !body.path("tips").isArray() || body.path("tips").size() > 16) {
            throw new JumpmapRequestException(400, "INVALID_REQUEST", "말풍선 목록을 확인해주세요.");
        }
        var tips = new HashSet<String>();
        for (JsonNode tip : body.path("tips")) {
            if (!tip.isTextual()) throw new JumpmapRequestException(400, "INVALID_REQUEST", "말풍선 목록을 확인해주세요.");
            tips.add(tip.textValue());
        }
        service.seeTips(Long.toString(userId), tips);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(JumpmapRequestException.class)
    ResponseEntity<Map<String, String>> failed(JumpmapRequestException exception) {
        return ResponseEntity.status(exception.status).cacheControl(CacheControl.noStore())
                .body(Map.of("code", exception.code, "message", exception.getMessage()));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> unavailable(DataAccessException exception) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore())
                .body(Map.of("code", "JUMPMAP_UNAVAILABLE", "message", "점프맵 정보를 잠시 확인할 수 없어요."));
    }

    private static long account(Principal principal) {
        if (principal == null) throw new JumpmapRequestException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        try {
            long userId = Long.parseLong(principal.getName());
            if (userId <= 0) throw new NumberFormatException();
            return userId;
        } catch (NumberFormatException exception) {
            throw new JumpmapRequestException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    static final class JumpmapRequestException extends RuntimeException {
        private final int status;
        private final String code;

        JumpmapRequestException(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code;
        }
    }
}
