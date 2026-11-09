package com.ssafy.ontop.skin;

import com.ssafy.ontop.skin.SkinDtos.*;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/** 임시 업로드 경로와 공개 불변 경로를 분리해, 아직 유효한 PUT URL로 공개 파일을 덮어쓰지 못하게 한다. */
public final class S3SkinStorage implements SkinStorage,AutoCloseable {
    private final SkinSettings settings;
    private final S3Client client;
    private final S3Presigner signer;
    public S3SkinStorage(SkinSettings settings) {
        this.settings=settings;
        client=settings.configured()?S3Client.builder().region(Region.of(settings.region()))
                .overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(30)).apiCallAttemptTimeout(Duration.ofSeconds(15))).build():null;
        signer=settings.configured()?S3Presigner.builder().region(Region.of(settings.region())).build():null;
    }
    public boolean ready() { return settings.configured(); }
    public Target upload(String key,FileSpec spec,String contentType) {
        require();
        try {
            var signed=signer.presignPutObject(r->r.signatureDuration(Duration.ofSeconds(settings.ttlSeconds()))
                    .putObjectRequest(PutObjectRequest.builder().bucket(settings.bucket()).key(key).contentType(contentType)
                            .contentLength(spec.bytes()).checksumSHA256(Base64.getEncoder().encodeToString(HexFormat.of().parseHex(spec.sha256()))).build()));
            Map<String,String> headers=new HashMap<>();
            signed.signedHeaders().forEach((k,v)->{ if(!k.equalsIgnoreCase("host")&&!k.equalsIgnoreCase("content-length")) headers.put(k,String.join(",",v)); });
            return new Target(signed.url().toString(),Map.copyOf(headers));
        } catch(RuntimeException e) { throw SkinStorage.unavailable(); }
    }
    public byte[] read(String key,long expectedBytes) {
        require();
        try {
            var head=client.headObject(r->r.bucket(settings.bucket()).key(key));
            if(head.contentLength()!=expectedBytes) throw SkinException.invalid("업로드 파일 크기가 다릅니다.");
            try(var input=client.getObject(GetObjectRequest.builder().bucket(settings.bucket()).key(key).build())) {
                byte[] bytes=input.readNBytes(Math.toIntExact(expectedBytes+1));
                if(bytes.length!=expectedBytes) throw SkinException.invalid("업로드가 완료되지 않았습니다.");
                return bytes;
            }
        } catch(SkinException e) { throw e; }
        catch(S3Exception e) { if(e.statusCode()==404) throw new SkinException(409,"SKIN_UPLOAD_INCOMPLETE","두 파일 업로드를 완료해주세요."); throw SkinStorage.unavailable(); }
        catch(Exception e) { throw SkinStorage.unavailable(); }
    }
    public void seal(String key,byte[] bytes,String contentType,String sha256) {
        require();
        try {
            client.putObject(PutObjectRequest.builder().bucket(settings.bucket()).key(key).contentType(contentType)
                    .cacheControl("public,max-age=31536000,immutable").ifNoneMatch("*")
                    .checksumSHA256(Base64.getEncoder().encodeToString(HexFormat.of().parseHex(sha256))).build(),RequestBody.fromBytes(bytes));
        } catch(S3Exception e) {
            if(e.statusCode()!=412||!SkinFileValidator.sha256(read(key,bytes.length)).equals(sha256)) throw SkinStorage.unavailable();
        } catch(RuntimeException e) { throw SkinStorage.unavailable(); }
    }
    public String url(String key) { require(); return settings.cdn()+"/"+key; }
    private void require() { if(!ready()) throw SkinStorage.unavailable(); }
    public void close() { if(client!=null) client.close(); if(signer!=null) signer.close(); }
}
