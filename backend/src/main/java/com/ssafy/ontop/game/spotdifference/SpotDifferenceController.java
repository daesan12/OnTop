package com.ssafy.ontop.game.spotdifference;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.operation.config.NewActivity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
@RequestMapping("/api/v1/minigames/spot-difference")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
public class SpotDifferenceController {
    private final SpotDifferenceService games;
    private final SpotDifferenceDuelService duels;

    SpotDifferenceController(SpotDifferenceService games, SpotDifferenceDuelService duels) {
        this.games = games;
        this.duels = duels;
    }

    @GetMapping("/status")
    @Operation(summary = "사격정 미니게임 공통 엽전 한도 조회")
    public ResponseEntity<SpotDifferenceRewards.Budget> status(@AuthenticationPrincipal AuthenticatedUser user) {
        return response(games.status(userId(user)));
    }

    @PostMapping("/runs")
    @NewActivity
    @Operation(summary = "사격정 틀린 그림 찾기 5장 시작")
    public ResponseEntity<SpotDifferenceService.View> start(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody SpotDifferenceService.Start input) {
        return response(games.start(userId(user), input));
    }

    @PostMapping("/runs/{id}/actions")
    @Operation(summary = "사격정 좌표 판정, 장면 진행 및 완주 정산")
    public ResponseEntity<SpotDifferenceService.View> act(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID id, @RequestBody SpotDifferenceService.Action action) {
        return response(games.act(userId(user), id, action));
    }

    @PostMapping("/duels")
    @NewActivity
    @Operation(summary = "사격정 2인 대결 방 생성")
    public ResponseEntity<SpotDifferenceDuelService.DuelView> createDuel(
            @AuthenticationPrincipal AuthenticatedUser user, @RequestBody CreateDuel input) {
        return response(duels.create(userId(user), input.difficulty(), input.title()));
    }

    @GetMapping("/duels")
    @Operation(summary = "사격정 참가 가능한 공개 대결 방 목록")
    public ResponseEntity<List<SpotDifferenceDuelService.Room>> rooms(
            @AuthenticationPrincipal AuthenticatedUser user) {
        userId(user);
        return response(duels.rooms());
    }

    @PostMapping("/duels/{code}/join")
    @NewActivity
    @Operation(summary = "공개 방 목록에서 사격정 2인 대결 참가")
    public ResponseEntity<SpotDifferenceDuelService.DuelView> joinDuel(
            @AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID code) {
        return response(duels.join(userId(user), code));
    }

    @GetMapping("/duels/current")
    @Operation(summary = "사격정 2인 대결 다시 연결")
    public ResponseEntity<SpotDifferenceDuelService.Current> currentDuel(
            @AuthenticationPrincipal AuthenticatedUser user) {
        return response(duels.current(userId(user)));
    }

    @PostMapping("/duels/{id}/actions")
    @Operation(summary = "사격정 2인 대결 준비, 좌표 판정, 상태 동기화 및 퇴장")
    public ResponseEntity<SpotDifferenceDuelService.DuelView> actDuel(
            @AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id,
            @RequestBody SpotDifferenceDuelService.DuelAction action) {
        return response(duels.act(userId(user), id, action));
    }

    record CreateDuel(SpotDifferenceService.Difficulty difficulty, String title) { }

    private static <T> ResponseEntity<T> response(T value) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
    }

    private static long userId(AuthenticatedUser user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요해요.");
        return user.userId();
    }
}
