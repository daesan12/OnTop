package com.ssafy.ontop.announcement.controller;
import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.announcement.dto.*;
import com.ssafy.ontop.announcement.service.EntryNewsService;
import com.ssafy.ontop.announcement.service.EntryNewsStorage;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.security.Principal;
import java.util.List;

@io.swagger.v3.oas.annotations.tags.Tag(name="ENTRY_NEWS")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name="AccessJwt")
@RestController
public class EntryNewsController {
    private final ObjectProvider<EntryNewsService> services;private final ObjectProvider<EntryNewsStorage> stores;private final AdminAccessPolicy access;
    public EntryNewsController(ObjectProvider<EntryNewsService> services,ObjectProvider<EntryNewsStorage> stores,AdminAccessPolicy access){this.services=services;this.stores=stores;this.access=access;}
    @io.swagger.v3.oas.annotations.Operation(summary="회원 접속 안내 목록 조회")
    @GetMapping("/api/v1/entry-news") public ResponseEntity<EntryNewsService.Feed> feed(Principal p){member(p);return ok(service().feed());}
    @io.swagger.v3.oas.annotations.Operation(summary="게시된 접속 안내 이미지 조회")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="200",content={@io.swagger.v3.oas.annotations.media.Content(mediaType="image/png",schema=@io.swagger.v3.oas.annotations.media.Schema(type="string",format="binary")),@io.swagger.v3.oas.annotations.media.Content(mediaType="image/jpeg",schema=@io.swagger.v3.oas.annotations.media.Schema(type="string",format="binary"))})
    @GetMapping(value="/api/v1/entry-news/{id}/image",produces={MediaType.IMAGE_PNG_VALUE,MediaType.IMAGE_JPEG_VALUE}) public ResponseEntity<byte[]> image(Principal p,@PathVariable String id){member(p);return imageResponse(service().image(id,false));}
    @io.swagger.v3.oas.annotations.Operation(summary="관리자 접속 안내 목록 조회")
    @GetMapping("/api/v1/admin/operations/entry-news") public ResponseEntity<List<EntryNewsItem>> list(Principal p){admin(p);return ok(service().list());}
    @io.swagger.v3.oas.annotations.Operation(summary="관리자 접속 안내 이미지 미리보기")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="200",content={@io.swagger.v3.oas.annotations.media.Content(mediaType="image/png",schema=@io.swagger.v3.oas.annotations.media.Schema(type="string",format="binary")),@io.swagger.v3.oas.annotations.media.Content(mediaType="image/jpeg",schema=@io.swagger.v3.oas.annotations.media.Schema(type="string",format="binary"))})
    @GetMapping(value="/api/v1/admin/operations/entry-news/{id}/image",produces={MediaType.IMAGE_PNG_VALUE,MediaType.IMAGE_JPEG_VALUE}) public ResponseEntity<byte[]> adminImage(Principal p,@PathVariable String id){admin(p);return imageResponse(service().image(id,true));}
    @io.swagger.v3.oas.annotations.Operation(summary="관리자 접속 안내 S3 직접 업로드 주소 발급")
    @PostMapping("/api/v1/admin/operations/entry-news/{id}/uploads")
    public ResponseEntity<EntryNewsStorage.UploadTarget> upload(Principal p,@PathVariable String id,@RequestBody EntryNewsUploadRequest request){long actor=admin(p);service();return ok(storage().signUpload(id,actor,request));}
    @io.swagger.v3.oas.annotations.Operation(summary="관리자 접속 안내 이미지 등록")
    @PostMapping(value="/api/v1/admin/operations/entry-news/{id}",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<EntryNewsItem> create(Principal p,@PathVariable String id,@RequestBody EntryNewsSaveRequest request){long actor=admin(p);return ok(service().save(id,request.draft(),storage().uploaded(id,actor,request.upload()),true,actor));}
    @io.swagger.v3.oas.annotations.Operation(summary="관리자 접속 안내 수정")
    @PutMapping(value="/api/v1/admin/operations/entry-news/{id}",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<EntryNewsItem> update(Principal p,@PathVariable String id,@RequestBody EntryNewsSaveRequest request){long actor=admin(p);return ok(service().save(id,request.draft(),request.upload()==null?null:storage().uploaded(id,actor,request.upload()),false,actor));}
    @io.swagger.v3.oas.annotations.Operation(summary="관리자 접속 안내 삭제")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="삭제 완료",content=@io.swagger.v3.oas.annotations.media.Content)
    @DeleteMapping("/api/v1/admin/operations/entry-news/{id}")public ResponseEntity<Void> remove(Principal p,@PathVariable String id,@RequestParam long version){service().remove(id,version,admin(p));return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
    @io.swagger.v3.oas.annotations.Operation(summary="관리자 접속 안내 순서 저장")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="순서 저장 완료",content=@io.swagger.v3.oas.annotations.media.Content)
    @PutMapping("/api/v1/admin/operations/entry-news/order")public ResponseEntity<Void> reorder(Principal p,@RequestBody AnnouncementOrderRequest d){service().reorder(d,admin(p));return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
    private EntryNewsStorage storage(){var s=stores.getIfAvailable();if(s==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"접속 안내 저장소 준비 중");return s;}
    private long member(Principal p){if(p==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);try{long id=Long.parseLong(p.getName());if(id<=0)throw new NumberFormatException();return id;}catch(NumberFormatException e){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);}}
    private long admin(Principal p){long id=member(p);if(!access.canOperate(id))throw new ResponseStatusException(HttpStatus.FORBIDDEN);return id;}
    private EntryNewsService service(){var s=services.getIfAvailable();if(s==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"접속 안내 저장소 준비 중");return s;}
    private <T>ResponseEntity<T> ok(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
    private ResponseEntity<byte[]> imageResponse(byte[] body){return ResponseEntity.ok().contentType(body.length>2&&(body[0]&255)==255&&(body[1]&255)==216?MediaType.IMAGE_JPEG:MediaType.IMAGE_PNG).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(body);}
}
