package com.ssafy.ontop.minigame.telemetry;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
public class MoleAuditController {
    private static final Logger log = LoggerFactory.getLogger(MoleAuditController.class);
    private final ObjectProvider<MoleAuditService> audits;

    MoleAuditController(ObjectProvider<MoleAuditService> audits) {
        this.audits = audits;
    }

    @PostMapping("/api/v1/minigames/{game:whack-a-mole|speed-mole}/rounds/{id}/observations")
    @Operation(summary = "두더지 판 중 타격 기록", tags = "MINIGAME", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponse(responseCode = "204", description = "관측 요청 처리 완료")
    public ResponseEntity<Void> observe(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable String game,
            @PathVariable long id, @RequestBody MoleAuditDtos.Batch batch) {
        Instant receivedAt = Instant.now();
        MoleAuditGame auditGame = game(game);
        long userId = user.userId();
        var taps = batch.taps();
        try {
            MoleAuditService audit = audits.getIfAvailable();
            if (audit != null) {
                audit.receive(auditGame, id, userId, taps, receivedAt);
            }
        } catch (DataAccessException error) {
            log.debug("두더지 타격 관측을 저장하지 못했습니다. game={} roundId={}", game, id, error);
        } catch (RuntimeException error) {
            // 관측 처리 실패는 응답에 드러내지 않고 서버에서 진단한다.
            log.warn("두더지 타격 관측 처리에 실패했습니다. game={} roundId={}", game, id, error);
        }
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/api/v1/admin/macro-analysis/mole")
    @Operation(summary = "두더지 플레이 기록 조회", tags = "ADMIN", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<List<MoleAuditDtos.Round>> search(@RequestParam String game,
            @RequestParam(required = false) Long userId, @RequestParam(required = false) Long roundId,
            @RequestParam(required = false) LocalDate date) {
        if ((userId != null && userId <= 0) || (roundId != null && roundId <= 0)
                || (userId == null && roundId == null && date == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "회원 ID, 판 ID 또는 날짜를 확인하세요.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(requireAudit().search(game(game), userId, roundId, date));
    }

    @GetMapping("/api/v1/admin/macro-analysis/mole/detections")
    @Operation(summary = "두더지 더미 표적 적발 회원 조회", tags = "ADMIN",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<MoleAuditDtos.Detections> detections(@RequestParam String game) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(requireAudit().detections(game(game), Instant.now()));
    }

    @GetMapping("/api/v1/admin/macro-analysis/mole/timing")
    @Operation(summary = "두더지 타이밍 신호 적발 회원 조회", tags = "ADMIN",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<MoleAuditDtos.TimingDetections> timing(@RequestParam String game) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(requireAudit().timingDetections(game(game), Instant.now()));
    }

    @GetMapping("/api/v1/admin/macro-analysis/mole/{id}")
    @Operation(summary = "두더지 판 타임라인과 비교", tags = "ADMIN", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<MoleAuditDtos.Detail> detail(@PathVariable long id, @RequestParam String game,
            @RequestParam MoleAuditDtos.Input input) {
        var detail = requireAudit().detail(game(game), id, input);
        if (detail == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(detail);
    }

    private MoleAuditService requireAudit() {
        MoleAuditService audit = audits.getIfAvailable();
        if (audit == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "두더지 기록 저장소를 사용할 수 없습니다.");
        }
        return audit;
    }

    private static MoleAuditGame game(String path) {
        for (var game : MoleAuditGame.values()) {
            if (game.path.equals(path)) {
                return game;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하는 두더지 게임을 선택하세요.");
    }
}
