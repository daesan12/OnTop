package com.ssafy.ontop.announcement.service;

import com.ssafy.ontop.announcement.dto.*;
import java.util.Base64;
import java.util.HexFormat;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class EntryNewsDirectUploadTests {
    final String id="a78baf0b-0246-4391-adef-a247f90ac50a",upload="a78baf0b-0246-4391-adef-a247f90ac50b",hash="a".repeat(64);
    final S3Client client=mock(S3Client.class);
    EntryNewsStorage storage(S3Presigner signer){return new EntryNewsStorage("test-bucket","https://cdn.example.invalid","local",client,signer);}
    @Test void 주소는_관리자별_파일경로와_체크섬으로_5분_서명한다(){
        try(var signer=S3Presigner.builder().region(Region.AP_NORTHEAST_2).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test-access","test-secret"))).build()){
            var target=storage(signer).signUpload(id,7,new EntryNewsUploadRequest(20,hash,"image/png"));
            assertThat(target.url()).contains("/entry-news/local/published/7/"+id+"/"+target.uploadId()+"/"+hash+".png").contains("X-Amz-Expires=300");
            assertThat(target.headers().keySet()).noneMatch(k->k.equalsIgnoreCase("authorization")||k.equalsIgnoreCase("host"));
            assertThat(target.url()+target.headers()).contains("checksum-sha256");
            assertThatThrownBy(()->storage(signer).url("entry-news/local/incoming/7/"+id+"/"+upload)).isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(client);
    }
    HeadObjectResponse head(long bytes,String type,String sha){return HeadObjectResponse.builder().contentLength(bytes).contentType(type).checksumSHA256(sha).build();}
    void headReturns(HeadObjectResponse response){when(client.headObject(org.mockito.ArgumentMatchers.<Consumer<HeadObjectRequest.Builder>>any())).thenReturn(response);}
    @Test void 본문_다운로드_없이_S3의_크기_타입_체크섬을_확인하고_현재_관리자_경로만_검증한다(){
        String checksum=Base64.getEncoder().encodeToString(HexFormat.of().parseHex(hash));
        headReturns(head(20,"image/png",checksum));
        var evidence=new EntryNewsUploadEvidence(upload,20,hash,"image/png");var result=storage(null).uploaded(id,8,evidence);
        assertThat(result.key()).isEqualTo("entry-news/local/published/8/"+id+"/"+upload+"/"+hash+".png");assertThat(result.hash()).isEqualTo(hash);
        ArgumentCaptor<Consumer<HeadObjectRequest.Builder>> read=ArgumentCaptor.forClass(Consumer.class);verify(client).headObject(read.capture());
        var request=HeadObjectRequest.builder();read.getValue().accept(request);assertThat(request.build().key()).isEqualTo(result.key());assertThat(request.build().checksumMode()).isEqualTo(ChecksumMode.ENABLED);
        verifyNoMoreInteractions(client);
    }
    @Test void 실제_크기_타입_체크섬_위반과_체크섬_누락을_거절한다(){
        var store=storage(null);var evidence=new EntryNewsUploadEvidence(upload,20,hash,"image/png");String checksum=Base64.getEncoder().encodeToString(HexFormat.of().parseHex(hash));
        for(var response:new HeadObjectResponse[]{head(21,"image/png",checksum),head(20,"image/jpeg",checksum),head(20,"image/png","different"),head(20,"image/png",null)}){
            headReturns(response);assertThatThrownBy(()->store.uploaded(id,7,evidence)).isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void 잘못된_타입과_대용량과_임의_경로는_S3_호출_전에_거절한다(){
        var store=storage(null);
        assertThatThrownBy(()->store.signUpload(id,7,new EntryNewsUploadRequest(2097153,hash,"image/png"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->store.signUpload(id,7,new EntryNewsUploadRequest(20,hash,"image/svg+xml"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->store.uploaded(id,7,new EntryNewsUploadEvidence("../other",20,hash,"image/png"))).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(client);
    }
}
