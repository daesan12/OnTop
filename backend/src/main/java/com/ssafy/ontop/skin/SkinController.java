package com.ssafy.ontop.skin;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.skin.SkinDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1")
@Tag(name="SKIN")
@SecurityRequirement(name="AccessJwt")
public class SkinController {
    private final ObjectProvider<SkinService> services;
    @org.springframework.beans.factory.annotation.Autowired private ObjectProvider<SkinSetService> sets;
    public SkinController(ObjectProvider<SkinService> services) { this.services=services; }
    private static final String ROOT="/admin/operations/skins";
    @GetMapping(ROOT+"/settings") @Operation(operationId="skinSettings",summary="스킨 등록 권한·업로드 설정 조회")
    public ResponseEntity<?> settings(Principal p) { return ok(service().settings(account(p))); }
    @GetMapping(ROOT) @Operation(operationId="listSkinRegistrations",summary="스킨 등록 목록 조회",description="최신 200건, 지정 스킨 관리자만 조회")
    public ResponseEntity<?> list(Principal p) { return ok(service().list(account(p))); }
    @GetMapping(ROOT+"/components") @Operation(operationId="listSkinComponents",summary="착용 아이템 등록 목록")
    public ResponseEntity<?> components(Principal p) { return ok(service().components(account(p))); }
    @PostMapping(ROOT+"/components") @Operation(operationId="createSkinComponent",summary="착용 아이템 선등록")
    public ResponseEntity<?> component(Principal p,@RequestBody Definition input) { return ok(service().createComponent(account(p),input)); }
    @GetMapping(ROOT+"/sets") @Operation(operationId="listSkinSets",summary="스킨 세트 목록")
    public ResponseEntity<?> sets(Principal p) { return ok(sets().list(account(p))); }
    @PostMapping(ROOT+"/sets") @Operation(operationId="createSkinSet",summary="등록 아이템으로 세트 구성")
    public ResponseEntity<?> createSet(Principal p,@RequestBody SkinSetDtos.Definition input) { return ok(sets().create(account(p),input)); }
    @PutMapping(ROOT+"/sets/{id}") @Operation(operationId="updateSkinSet",summary="미공개 세트 수정",description="부위 중복409, 공개 이후 구성 변경409")
    public ResponseEntity<?> saveSet(Principal p,@PathVariable String id,@RequestBody SkinSetDtos.Save input) { return ok(sets().save(account(p),id,input)); }
    @PostMapping(ROOT+"/sets/{id}/publish") @Operation(operationId="publishSkinSet",summary="세트 신규 획득 공개")
    public ResponseEntity<?> publishSet(Principal p,@PathVariable String id,@RequestBody Version input) { if(input==null) throw SkinException.invalid("버전이 필요합니다.");return ok(sets().publish(account(p),id,input.version())); }
    @PostMapping(ROOT+"/sets/{id}/disable") @Operation(operationId="disableSkinSet",summary="세트 신규 획득 중단",description="기존 보유 아이템·영수증 유지")
    public ResponseEntity<?> disableSet(Principal p,@PathVariable String id,@RequestBody Version input) { if(input==null) throw SkinException.invalid("버전이 필요합니다.");return ok(sets().disable(account(p),id,input.version())); }
    private SkinSetService sets() { var s=sets.getIfAvailable();if(s==null) throw new SkinException(503,"SKIN_REGISTRATION_UNAVAILABLE","세트 DB 설정이 필요합니다.");return s; }
    @GetMapping(ROOT+"/{id}") @Operation(operationId="getSkinRegistration",summary="스킨 등록 상세 복구")
    public ResponseEntity<?> get(Principal p,@PathVariable String id) { return ok(service().get(account(p),id)); }
    @PostMapping(ROOT) @Operation(operationId="createSkinRegistration",summary="스킨 상품 임시저장")
    public ResponseEntity<?> create(Principal p,@RequestBody Definition input) { return ok(service().create(account(p),input)); }
    @PutMapping(ROOT+"/{id}") @Operation(operationId="updateSkinRegistration",summary="스킨 정보 수정",description="version 충돌 시409, 공개한 상품의 등급·구성 변경 금지")
    public ResponseEntity<?> save(Principal p,@PathVariable String id,@RequestBody Save input) { return ok(service().save(account(p),id,input)); }
    @PostMapping(ROOT+"/{id}/uploads") @Operation(operationId="issueSkinUpload",summary="GLB·WebP 업로드 URL 발급",description="최대5분, 임시 경로만 서명. ANY 통합 스킨은 femaleModel로 여캐용 GLB를 추가하며 생략/동일 파일이면 같은 모델 ID를 공유. AWS 미설정503, 파일한도400")
    public ResponseEntity<?> upload(Principal p,@PathVariable String id,@RequestBody UploadRequest input) { return ok(service().issue(account(p),id,input)); }
    @PostMapping(ROOT+"/{id}/uploads/{uploadId}/verify") @Operation(operationId="verifySkinUpload",summary="파일 바이트·해시·렌더러 규격 검증")
    public ResponseEntity<?> verify(Principal p,@PathVariable String id,@PathVariable String uploadId) { return ok(service().verifyView(account(p),id,uploadId)); }
    @PostMapping(ROOT+"/{id}/publish") @Operation(operationId="publishSkinRegistration",summary="검수한 스킨 공개",description="검증 파일만 기존 상품/아이템에 원자 연결. 같은 파일 공개 재요청은 동일 결과, 검증 전409")
    public ResponseEntity<?> publish(Principal p,@PathVariable String id,@RequestBody Publish input) { return ok(service().publish(account(p),id,input)); }
    @PostMapping(ROOT+"/{id}/disable") @Operation(operationId="disableSkinRegistration",summary="스킨 신규 획득 중단",description="기존 보유·착용·과거 영수증은 보존")
    public ResponseEntity<?> disable(Principal p,@PathVariable String id,@RequestBody Version input) { return ok(service().disable(account(p),id,input)); }
    @GetMapping("/skins/assets") @Operation(operationId="listSkinAssets",summary="공개 의상 파일 목록",description="인증 회원 전용. 임시 파일·서명 URL 제외, 비활성 상품의 기존 파일은 유지")
    public ResponseEntity<?> assets(Principal p) { account(p);var s=services.getIfAvailable();return ok(s==null?List.of():s.assets()); }
    private SkinService service() { var s=services.getIfAvailable();if(s==null) throw new SkinException(503,"SKIN_REGISTRATION_UNAVAILABLE","스킨 등록 DB 설정이 필요합니다.");return s; }
    private long account(Principal p) {
        try { long id=p==null?0:Long.parseLong(p.getName());if(id<=0) throw new IllegalArgumentException();return id; }
        catch(RuntimeException e) { throw new SkinException(401,"UNAUTHENTICATED","로그인이 필요합니다."); }
    }
    private ResponseEntity<?> ok(Object body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @ExceptionHandler(SkinException.class) ResponseEntity<?> error(SkinException e) { return ResponseEntity.status(e.status()).cacheControl(CacheControl.noStore()).body(new Error(e.code(),e.getMessage())); }
    @ExceptionHandler(DuplicateKeyException.class) ResponseEntity<?> duplicate() { return error(new SkinException(409,"SKIN_CODE_EXISTS","이미 등록된 상품 코드입니다. 목록에서 확인해주세요.")); }
    @ExceptionHandler({DataAccessException.class,TransactionException.class}) ResponseEntity<?> unavailable() { return error(new SkinException(503,"SKIN_REGISTRATION_UNAVAILABLE","등록 결과를 확인하지 못했습니다. 목록을 다시 조회해주세요.")); }
    public record Error(String code,String message) { }
}
