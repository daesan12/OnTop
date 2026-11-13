package com.ssafy.ontop.skin;

import com.ssafy.ontop.skin.SkinDtos.*;
import java.util.List;
import java.util.UUID;
import java.util.function.LongPredicate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public class SkinService {
    private final SkinRepository repository;
    private final SkinSettings settings;
    private final SkinStorage storage;
    private final SkinFileValidator files;
    private final TransactionTemplate transactions;
    private final LongPredicate operator;
    public SkinService(SkinRepository repository,SkinSettings settings,SkinStorage storage,SkinFileValidator files,
                       PlatformTransactionManager manager,LongPredicate operator) {
        this.repository=repository;this.settings=settings;this.storage=storage;this.files=files;
        transactions=new TransactionTemplate(manager); this.operator=operator;
    }
    private void access(long user) { settings.requireAdmin(user); if(!operator.test(user)) throw new SkinException(403,"SKIN_ACCESS_DENIED","운영 권한이 필요합니다."); }
    public Settings settings(long user) { access(user); return new Settings(storage.ready(),settings.modelMax(),settings.imageMax(),settings.ttlSeconds()); }
    public List<Entry> list(long user) { access(user); return transactions.execute(s->repository.list()); }
    public Entry get(long user,String id) { access(user); SkinRules.id(id); return transactions.execute(s->repository.get(id,false)); }
    public List<Entry> components(long user) { access(user);return transactions.execute(s->repository.components()); }
    public Entry createComponent(long user,Definition input) {
        access(user);var d=SkinRules.validate(input);String id=UUID.randomUUID().toString();
        return transactions.execute(s->{repository.create(id,d,user);repository.markComponent(id);return repository.get(id,false);});
    }
    public Entry create(long user,Definition input) {
        access(user); var d=SkinRules.validate(input);String id=UUID.randomUUID().toString();
        return transactions.execute(s->{repository.create(id,d,user);return repository.get(id,false);});
    }
    public Entry save(long user,String id,Save request) {
        access(user);SkinRules.id(id);if(request==null) throw SkinException.invalid("입력값이 필요합니다.");
        var d=SkinRules.validate(request.definition()); SkinRules.version(request.version());
        return transactions.execute(s->{
            Entry e=repository.get(id,true); sameVersion(e,request.version());
            if(!e.definition().productCode().equals(d.productCode())) throw SkinException.invalid("상품 코드는 변경할 수 없습니다.");
            if(e.publishedUploadId()!=null&&(!e.definition().slots().equals(d.slots())||e.definition().grade()!=d.grade()
                    ||!e.definition().compatibility().equals(d.compatibility())||!e.definition().wearMode().equals(d.wearMode())))
                throw new SkinException(409,"SKIN_PUBLISHED_DEFINITION_IMMUTABLE","공개한 상품의 등급·호환·구성은 새 상품으로 등록해주세요.");
            repository.update(e,d,user); return repository.get(id,false);
        });
    }
    public UploadTicket issue(long user,String id,UploadRequest request) {
        access(user);SkinRules.id(id);if(!storage.ready()) throw SkinStorage.unavailable();
        if(request==null) throw SkinException.invalid("업로드할 파일이 필요합니다.");
        SkinRules.version(request.version());SkinRules.file(request.model(),".glb",settings.modelMax());SkinRules.file(request.image(),".webp",settings.imageMax());
        Entry before=transactions.execute(s->repository.get(id,false));sameVersion(before,request.version());
        SkinRules.femaleModel(before.definition(),request.femaleModel());
        if(request.femaleModel()!=null) SkinRules.file(request.femaleModel(),".glb",settings.modelMax());
        boolean separateFile=request.femaleModel()!=null&&!(request.model().bytes()==request.femaleModel().bytes()
                &&request.model().sha256().equals(request.femaleModel().sha256()));
        String uploadId=UUID.randomUUID().toString(),prefix="skins/"+settings.environment()+"/"+id+"/"+uploadId;
        // 서명/자격 증명 조회는 DB 잠금을 잡기 전에 수행한다.
        Target model=storage.upload(prefix+"/incoming/model.glb",request.model(),"model/gltf-binary");
        Target image=storage.upload(prefix+"/incoming/image.webp",request.image(),"image/webp");
        Target female=!separateFile?null:storage.upload(prefix+"/incoming/female.glb",request.femaleModel(),"model/gltf-binary");
        Upload u=transactions.execute(s->{Entry e=repository.get(id,true);sameVersion(e,request.version());
            ModelFile primary=new ModelFile(UUID.randomUUID().toString(),"model.glb",request.model().bytes(),request.model().sha256());
            ModelFile alternate=!separateFile?primary:new ModelFile(UUID.randomUUID().toString(),"female.glb",request.femaleModel().bytes(),request.femaleModel().sha256());
            Upload result=new Upload(uploadId,id,e.version(),request.model().bytes(),request.image().bytes(),request.model().sha256(),request.image().sha256(),prefix,
                    repository.now().plusSeconds(settings.ttlSeconds()),null,
                    e.definition().compatibility().equals("FEMALE")?null:primary,e.definition().compatibility().equals("MALE")?null:alternate);
            repository.insertUpload(result,user);return result;});
        return new UploadTicket(u.id(),u.expiresAt(),model,image,female);
    }
    public Upload verify(long user,String id,String uploadId) {
        access(user);SkinRules.id(id);SkinRules.id(uploadId);
        Entry before=transactions.execute(s->repository.get(id,false));
        Upload upload=transactions.execute(s->repository.upload(id,uploadId));
        requireModels(before.definition(),upload);
        if(upload.verifiedAt()!=null&&upload.id().equals(before.publishedUploadId())) return upload;
        sameVersion(before,upload.catalogVersion());
        if(upload.verifiedAt()!=null) return upload;
        // S3 왕복·파싱은 트랜잭션 밖. 크기를 먼저 제한하고 임시 PUT 경로를 불변 공개 경로에 봉인한다.
        byte[] image=storage.read(upload.prefix()+"/incoming/image.webp",upload.imageBytes());
        boolean separate=upload.maleModel()!=null&&upload.femaleModel()!=null&&!upload.maleModel().id().equals(upload.femaleModel().id());
        for(ModelFile file:java.util.stream.Stream.of(upload.maleModel(),upload.femaleModel()).filter(java.util.Objects::nonNull).distinct().toList()) {
            // 파일별 검증·봉인은 트랜잭션 밖에서 수행한다. 둘 다 완료돼야 verified_at을 확정한다.
            byte[] model=storage.read(upload.prefix()+"/incoming/"+file.fileName(),file.bytes());
            Definition definition=separate?SkinRules.modelDefinition(before.definition(),file.equals(upload.maleModel())?"MALE":"FEMALE"):before.definition();
            files.validate(model,image,definition,file.sha256(),upload.imageSha256());
            storage.seal(upload.prefix()+"/published/"+file.fileName(),model,"model/gltf-binary",file.sha256());
        }
        storage.seal(upload.prefix()+"/published/image.webp",image,"image/webp",upload.imageSha256());
        return transactions.execute(s->{Entry current=repository.get(id,true);sameVersion(current,upload.catalogVersion());
            repository.verified(uploadId);return repository.upload(id,uploadId);});
    }
    public Verified verifyView(long user,String id,String uploadId) {
        Upload u=verify(user,id,uploadId);
        return new Verified(u.id(),storage.url(u.prefix()+"/published/model.glb"),storage.url(u.prefix()+"/published/image.webp"),
                u.maleModel()!=null&&u.femaleModel()!=null?modelUrl(u.prefix(),u.femaleModel()):null,
                u.maleModel()==null?null:u.maleModel().id(),u.femaleModel()==null?null:u.femaleModel().id());
    }
    public Entry publish(long user,String id,Publish request) {
        access(user);SkinRules.id(id);
        if(request==null||!request.reviewed()) throw SkinException.invalid("모델 미리보기·착용 규격 검수를 확인해주세요.");
        SkinRules.id(request.uploadId());SkinRules.version(request.version()); if(!storage.ready()) throw SkinStorage.unavailable();
        return transactions.execute(s->{
            Entry e=repository.get(id,true);Upload u=repository.upload(id,request.uploadId());
            requireModels(e.definition(),u);
            if(e.state().equals("PUBLISHED")&&u.id().equals(e.publishedUploadId())) return e;
            sameVersion(e,request.version());if(!u.id().equals(e.publishedUploadId())) sameVersion(e,u.catalogVersion());
            if(u.verifiedAt()==null) throw new SkinException(409,"SKIN_NOT_VERIFIED","업로드 파일 검증을 먼저 완료해주세요.");
            repository.publish(e,u,user);return repository.get(id,false);
        });
    }
    public Entry disable(long user,String id,Version request) {
        access(user);SkinRules.id(id);if(request==null) throw SkinException.invalid("상태 버전이 필요합니다.");SkinRules.version(request.version());
        return transactions.execute(s->{Entry e=repository.get(id,true);sameVersion(e,request.version());
            repository.disable(e,user);return repository.get(id,false);});
    }
    public void delete(long user,String id,Version request) {
        access(user);SkinRules.id(id);if(request==null)throw SkinException.invalid("상태 버전이 필요합니다.");SkinRules.version(request.version());
        transactions.executeWithoutResult(s->{
            Entry e=repository.get(id,true);sameVersion(e,request.version());
            // Set creation holds the same component row lock before inserting its membership.
            if(repository.referencedBySet(id))throw new SkinException(409,"SKIN_IN_USE","이 스킨을 사용하는 세트를 먼저 삭제해주세요. 기존 보유·착용은 유지됩니다.");
            repository.delete(e,user);
        });
    }
    public List<Asset> assets() {
        if(!storage.ready()) return List.of();
        return transactions.execute(s->repository.publishedUploads().stream().map(u->{
            var d=u.definition();
            return new Asset("catalog/"+u.uploadId(),d.productCode(),d.name(),d.grade(),d.compatibility(),d.wearMode(),d.slots(),
                    storage.url(u.prefix()+"/published/model.glb"),storage.url(u.prefix()+"/published/image.webp"),
                    u.maleModel()!=null&&u.femaleModel()!=null?modelUrl(u.prefix(),u.femaleModel()):null,
                    u.maleModel()==null?null:u.maleModel().id(),u.femaleModel()==null?null:u.femaleModel().id());
        }).toList());
    }
    private String modelUrl(String prefix,ModelFile model) { return storage.url(prefix+"/published/"+model.fileName()); }
    private static void requireModels(Definition definition,Upload upload) {
        if((!definition.compatibility().equals("FEMALE")&&upload.maleModel()==null)
                ||(!definition.compatibility().equals("MALE")&&upload.femaleModel()==null))
            throw new SkinException(409,"SKIN_UPLOAD_INCOMPLETE","캐릭터별 모델 연결이 없어요. 파일을 다시 업로드해주세요.");
    }
    private static void sameVersion(Entry e,long version) {
        if(e.version()!=version) throw new SkinException(409,"SKIN_VERSION_CHANGED","다른 창에서 변경됐어요. 목록을 다시 불러온 뒤 확인해주세요.");
    }
}
