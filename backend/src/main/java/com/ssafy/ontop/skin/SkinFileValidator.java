package com.ssafy.ontop.skin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.skin.SkinDtos.Definition;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Set;

/** 확장자가 아닌 실제 바이트를 검증한다. 외부 URI·압축 확장은 현재 렌더러에서 승인하지 않는다. */
public class SkinFileValidator {
    private final ObjectMapper json;
    public SkinFileValidator(ObjectMapper json) { this.json=json; }
    public void validate(byte[] model,byte[] image,Definition d,String modelHash,String imageHash) {
        if(!sha256(model).equals(modelHash)||!sha256(image).equals(imageHash)) throw SkinException.invalid("업로드 파일이 선택한 파일과 달라요. 다시 업로드해주세요.");
        if(image.length<12||!new String(image,0,4,java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
                ||!new String(image,8,4,java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")
                ||Integer.toUnsignedLong(ByteBuffer.wrap(image,4,4).order(ByteOrder.LITTLE_ENDIAN).getInt())+8!=image.length)
            throw SkinException.invalid("유효한 WebP 이미지가 아닙니다.");
        webpDimensions(image);
        try {
            ByteBuffer b=ByteBuffer.wrap(model).order(ByteOrder.LITTLE_ENDIAN);
            if(b.remaining()<20||b.getInt()!=0x46546c67||b.getInt()!=2||b.getInt()!=model.length) throw new IllegalArgumentException();
            int length=b.getInt(); if(b.getInt()!=0x4e4f534a||length<2||length%4!=0||length>b.remaining()||length>2_000_000) throw new IllegalArgumentException();
            byte[] document=new byte[length]; b.get(document); JsonNode root=json.readTree(document);
            if(b.remaining()<8) throw new IllegalArgumentException();
            int binLength=b.getInt();
            if(b.getInt()!=0x004e4942||binLength<0||binLength%4!=0||binLength!=b.remaining()) throw new IllegalArgumentException();
            if(root.path("buffers").isEmpty()||root.path("buffers").size()>8) throw new IllegalArgumentException();
            long declared=root.path("buffers").path(0).path("byteLength").asLong(-1);
            if(declared<=0||declared>binLength||binLength-declared>3) throw new IllegalArgumentException();
            long totalBuffers=0;
            for(int i=0;i<root.path("buffers").size();i++) {
                JsonNode buffer=root.path("buffers").path(i);long bytes=buffer.path("byteLength").asLong(-1);
                if(bytes<=0||bytes>128L*1024*1024) throw new IllegalArgumentException();totalBuffers+=bytes;
                if(i>0&&!buffer.path("extensions").path("EXT_meshopt_compression").path("fallback").asBoolean()) throw new IllegalArgumentException();
            }
            if(totalBuffers>128L*1024*1024) throw SkinException.invalid("모델 해제 후 버퍼는 합계 128MiB 이하로 준비해주세요.");
            for(JsonNode view:root.path("bufferViews")) {
                int buffer=view.path("buffer").asInt(-1);
                if(buffer<0||buffer>=root.path("buffers").size()) throw new IllegalArgumentException();
                checkBuffer(view,buffer,root.path("buffers").path(buffer).path("byteLength").asLong());
                JsonNode compressed=view.path("extensions").path("EXT_meshopt_compression");
                if(buffer>0&&compressed.isMissingNode()) throw new IllegalArgumentException();
                if(!compressed.isMissingNode()) checkBuffer(compressed,0,declared);
            }
            if(!root.path("asset").path("version").asText().equals("2.0")||!root.path("meshes").isArray()||root.path("meshes").isEmpty()
                    ||!root.path("skins").isArray()||root.path("skins").isEmpty()) throw new IllegalArgumentException();
            rejectExternal(root);
            for(JsonNode extension:root.path("extensionsRequired")) if(!Set.of("EXT_meshopt_compression","EXT_texture_webp").contains(extension.asText()))
                throw SkinException.invalid("현재 OnTop 로더가 지원하지 않는 확장입니다: "+extension.asText());
            Set<String> names=new HashSet<>(); root.path("nodes").forEach(n->names.add(n.path("name").asText()));
            for(String bone:requiredBones()) if(!names.contains(bone)) throw SkinException.invalid("OnTop 뼈대가 누락되었습니다: "+bone);
            if(d.wearMode().equals("WHOLE")) {
                long meshes=0;boolean near=false,far=false;
                for(JsonNode node:root.path("nodes")) if(node.has("mesh")&&node.has("skin")) {
                    meshes+=root.path("meshes").path(node.path("mesh").asInt(-1)).path("primitives").size();
                    near|=node.path("name").asText().startsWith("near-");far|=node.path("name").asText().startsWith("far-");
                }
                String expected=d.compatibility().equals("FEMALE")?"girl":"man";
                boolean correctVariant=false;
                for(JsonNode node:root.path("nodes")) if(node.path("name").asText().equals("CharacterRig"))
                    correctVariant=node.path("extras").path("variant").asText("man").equals(expected);
                if(!near||!far||!correctVariant) throw SkinException.invalid("근·원거리 표면과 캐릭터 성별을 확인해주세요.");
                if(meshes!=2&&meshes!=10) throw SkinException.invalid("통합 스킨의 근거리·원거리 표면 구성을 확인해주세요.");
            } else {
                Set<String> pieces=new HashSet<>();
                root.path("nodes").forEach(n->n.path("extras").path("pieces").forEach(p->pieces.add(p.path(0).asText())));
                requireParts(pieces,d);
            }
        } catch(SkinException e) { throw e; }
        catch(Exception e) { throw SkinException.invalid("OnTop 규격의 GLB 2.0 파일을 확인해주세요."); }
    }
    static void requireParts(Set<String> pieces,Definition d) {
        Set<String> variants=d.compatibility().equals("ANY")?Set.of("man","girl"):
                Set.of(d.compatibility().equals("FEMALE")?"girl":"man");
        for(String slot:d.slots()) for(String variant:variants)
            if(pieces.stream().noneMatch(p->p.matches("item__"+slot+"__a(?:__for_"+variant+")?(?:__under_\\w+)?")))
                throw SkinException.invalid("해당 캐릭터의 의상 조각이 누락되었습니다: "+slot+" / "+variant);
    }
    private void checkBuffer(JsonNode view,int buffer,long size) {
        long offset=view.path("byteOffset").asLong(0),length=view.path("byteLength").asLong(-1);
        if(view.path("buffer").asInt(-1)!=buffer||offset<0||length<=0||offset>size||length>size-offset)
            throw SkinException.invalid("모델 버퍼 범위가 올바르지 않습니다.");
    }
    private void webpDimensions(byte[] image) {
        boolean found=false;
        for(int at=12;at+8<=image.length;) {
            String kind=new String(image,at,4,java.nio.charset.StandardCharsets.US_ASCII);
            long count=Integer.toUnsignedLong(ByteBuffer.wrap(image,at+4,4).order(ByteOrder.LITTLE_ENDIAN).getInt());
            if(count>image.length-at-8) throw SkinException.invalid("WebP 데이터가 잘렸습니다.");
            int p=at+8,width=0,height=0;
            if(kind.equals("ANIM")||kind.equals("ANMF")) throw SkinException.invalid("대표 이미지는 정지 WebP로 등록해주세요.");
            if(kind.equals("VP8X")&&count>=10) {
                if((image[p]&2)!=0) throw SkinException.invalid("대표 이미지는 정지 WebP로 등록해주세요.");
                width=1+(image[p+4]&255)+((image[p+5]&255)<<8)+((image[p+6]&255)<<16);
                height=1+(image[p+7]&255)+((image[p+8]&255)<<8)+((image[p+9]&255)<<16);
            } else if(kind.equals("VP8L")&&count>=5&&(image[p]&255)==0x2f) {
                int bits=ByteBuffer.wrap(image,p+1,4).order(ByteOrder.LITTLE_ENDIAN).getInt();width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;found=true;
            } else if(kind.equals("VP8 ")&&count>=10&&(image[p+3]&255)==0x9d&&(image[p+4]&255)==1&&(image[p+5]&255)==0x2a) {
                width=((image[p+6]&255)|((image[p+7]&255)<<8))&0x3fff;height=((image[p+8]&255)|((image[p+9]&255)<<8))&0x3fff;found=true;
            }
            if(width>4096||height>4096) throw SkinException.invalid("대표 이미지 가로·세로는 최대 4096px입니다.");
            at+=8+(int)count+((int)count&1);
        }
        if(!found) throw SkinException.invalid("유효한 WebP 이미지 프레임이 없습니다.");
    }
    private void rejectExternal(JsonNode n) {
        if(n.isObject()) n.fields().forEachRemaining(e->{
            if(e.getKey().equals("uri")) throw SkinException.invalid("외부 파일 참조 없이 GLB 안에 자원을 포함해주세요.");
            rejectExternal(e.getValue());
        }); else if(n.isArray()) n.forEach(this::rejectExternal);
    }
    public static String sha256(byte[] data) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)); }
        catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public static Set<String> requiredBones() {
        Set<String> result=new HashSet<>(Set.of("hips","spine","chest","neck","head","clavicle_L","clavicle_R",
                "upperArm_L","lowerArm_L","hand_L","upperArm_R","lowerArm_R","hand_R","upperLeg_L","lowerLeg_L","foot_L","upperLeg_R","lowerLeg_R","foot_R"));
        for(String side:new String[]{"L","R"}) for(String finger:new String[]{"thumb","index","middle","ring","pinky"})
            for(int i=1;i<=3;i++) result.add(finger+i+"_"+side);
        return Set.copyOf(result);
    }
}
