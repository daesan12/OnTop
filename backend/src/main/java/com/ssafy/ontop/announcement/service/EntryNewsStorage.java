package com.ssafy.ontop.announcement.service;
import java.net.URI;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.ChecksumMode;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import com.ssafy.ontop.announcement.dto.EntryNewsUploadRequest;
import com.ssafy.ontop.announcement.dto.EntryNewsUploadEvidence;
import java.util.*;

/** Shares the configured bucket/CDN, but never reads or writes the skin namespace. */
public class EntryNewsStorage implements AutoCloseable {
    private final String bucket,cdn,environment;private final S3Client client;private final S3Presigner signer;
    public EntryNewsStorage(String bucket,String region,String cdn,String environment){
        this.bucket=bucket;this.environment=environment;this.cdn=cdn.replaceAll("/+$","");
        if(!cdn.isBlank()){var uri=URI.create(cdn);if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null)throw new IllegalArgumentException("공지 CDN HTTPS 주소를 확인해주세요.");}
        client=bucket.isBlank()||cdn.isBlank()?null:S3Client.builder().region(Region.of(region)).overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(30)).apiCallAttemptTimeout(Duration.ofSeconds(15))).build();
        signer=client==null?null:S3Presigner.builder().region(Region.of(region)).build();
    }
    EntryNewsStorage(String bucket,String cdn,String environment,S3Client client,S3Presigner signer){this.bucket=bucket;this.cdn=cdn;this.environment=environment;this.client=client;this.signer=signer;}
    public record UploadTarget(String uploadId,String url,Map<String,String> headers,int expiresIn){}
    public UploadTarget signUpload(String id,long actor,EntryNewsUploadRequest request){
        validateId(id);if(actor<=0||request==null)throw new IllegalArgumentException("업로드 정보를 확인해주세요.");request.validate();require();
        String uploadId=UUID.randomUUID().toString(),key=objectKey(id,actor,uploadId,request.sha256(),request.contentType());
        try{
            var signed=signer.presignPutObject(r->r.signatureDuration(Duration.ofMinutes(5)).putObjectRequest(b->b.bucket(bucket).key(key).contentType(request.contentType()).contentLength(request.bytes()).cacheControl("public,max-age=31536000,immutable").checksumSHA256(Base64.getEncoder().encodeToString(HexFormat.of().parseHex(request.sha256())))));
            Map<String,String> headers=new HashMap<>();signed.signedHeaders().forEach((k,v)->{if(!k.equalsIgnoreCase("host")&&!k.equalsIgnoreCase("content-length"))headers.put(k,String.join(",",v));});
            return new UploadTarget(uploadId,signed.url().toString(),Map.copyOf(headers),300);
        }catch(RuntimeException e){throw unavailable();}
    }
    public record VerifiedImage(String key,String hash){}
    public VerifiedImage uploaded(String id,long actor,EntryNewsUploadEvidence evidence){
        validateId(id);if(actor<=0||evidence==null)throw new IllegalArgumentException("업로드 정보를 확인해주세요.");evidence.validate();require();
        String key=objectKey(id,actor,evidence.uploadId(),evidence.sha256(),evidence.contentType());
        try{
            var head=client.headObject(b->b.bucket(bucket).key(key).checksumMode(ChecksumMode.ENABLED));
            if(head.contentLength()!=evidence.bytes())throw new IllegalArgumentException("업로드 파일 크기가 다릅니다.");
            if(!evidence.contentType().equals(head.contentType()))throw new IllegalArgumentException("업로드 파일 형식이 다릅니다.");
            String checksum=Base64.getEncoder().encodeToString(HexFormat.of().parseHex(evidence.sha256()));
            if(!checksum.equals(head.checksumSHA256()))throw new IllegalArgumentException("업로드 파일 체크섬이 다릅니다.");
            return new VerifiedImage(key,evidence.sha256());
        }catch(IllegalArgumentException e){throw e;}
        catch(software.amazon.awssdk.services.s3.model.S3Exception e){
            if(e.statusCode()==404)throw new IllegalArgumentException("업로드된 안내 이미지를 찾지 못했어요. 파일을 다시 올려주세요.");
            throw unavailable();
        }catch(Exception e){throw unavailable();}
    }
    private String objectKey(String id,long actor,String uploadId,String hash,String contentType){return "entry-news/"+environment+"/published/"+actor+"/"+id+"/"+uploadId+"/"+hash+(contentType.equals("image/png")?".png":".jpg");}
    private void validateId(String id){if(id==null||!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException("안내 ID를 확인해주세요.");}
    public String url(String key){require();String uuid="[0-9a-f-]{36}",prefix="entry-news/"+environment+"/";
        boolean direct=key.matches(prefix+"published/[1-9][0-9]*/"+uuid+"/"+uuid+"/[0-9a-f]{64}\\.(png|jpg)");
        boolean legacy=key.matches(prefix+"(published/)?"+uuid+"/[0-9a-f]{64}\\.png");
        if(!direct&&!legacy)throw new IllegalArgumentException("안내 이미지 경로를 확인해주세요.");return cdn+"/"+key;
    }
    public byte[] read(String key){url(key);try(var input=client.getObject(b->b.bucket(bucket).key(key))){byte[] bytes=input.readNBytes(EntryNewsImage.MAX_BYTES+1);if(bytes.length>EntryNewsImage.MAX_BYTES)throw unavailable();return bytes;}catch(Exception e){throw unavailable();}}
    private void require(){if(client==null)throw unavailable();}
    private ResponseStatusException unavailable(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"접속 안내 S3·CDN 설정을 확인해주세요.");}
    public void close(){if(client!=null)client.close();if(signer!=null)signer.close();}
}
