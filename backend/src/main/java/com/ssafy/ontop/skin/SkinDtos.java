package com.ssafy.ontop.skin;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class SkinDtos {
    private SkinDtos() { }
    public record Definition(String productCode,String name,int grade,String compatibility,String wearMode,List<String> slots) { }
    public record Save(long version,Definition definition) { }
    public record FileSpec(String name,long bytes,String sha256) { }
    public record UploadRequest(long version,FileSpec model,FileSpec image,FileSpec femaleModel) {
        public UploadRequest(long version,FileSpec model,FileSpec image) { this(version,model,image,null); }
    }
    public record Publish(long version,String uploadId,boolean reviewed) { }
    public record Version(long version) { }
    public record Entry(String id,Definition definition,String state,long version,String publishedUploadId,
                        Instant updatedAt) { }
    public record Upload(String id,String skinId,long catalogVersion,long modelBytes,long imageBytes,String modelSha256,
                         String imageSha256,String prefix,Instant expiresAt,Instant verifiedAt,
                         ModelFile maleModel,ModelFile femaleModel) { }
    public record ModelFile(String id,String fileName,long bytes,String sha256) { }
    public record Target(String url,Map<String,String> headers) { }
    public record UploadTicket(String uploadId,Instant expiresAt,Target model,Target image,Target femaleModel) { }
    public record Verified(String uploadId,String modelUrl,String imageUrl,String femaleModelUrl,
                           String maleModelId,String femaleModelId) { }
    public record Settings(boolean storageReady,long maxModelBytes,long maxImageBytes,int urlTtlSeconds) { }
    public record Asset(String imageKey,String productCode,String name,int grade,String compatibility,String wearMode,
                        List<String> slots,String modelUrl,String imageUrl,String femaleModelUrl,
                        String maleModelId,String femaleModelId) { }
}
