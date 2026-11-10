package com.ssafy.ontop.skin;

import java.util.List;
import java.util.Set;
import com.ssafy.ontop.skin.SkinDtos.*;

public final class SkinRules {
    private SkinRules() { }
    public static final List<String> SLOTS=List.of("HAIR","FACE","TOP","BOTTOM","SHOES");
    public static Definition validate(Definition d) {
        if(d==null||d.productCode()==null||!d.productCode().matches("[A-Z][A-Z0-9_]{2,27}")
                ||d.name()==null||d.name().isBlank()||d.name().length()>100||d.name().chars().anyMatch(Character::isISOControl)
                ||d.grade()<1||d.grade()>4||!Set.of("MALE","FEMALE","ANY").contains(String.valueOf(d.compatibility()))
                ||!Set.of("PARTS","WHOLE").contains(String.valueOf(d.wearMode()))||d.slots()==null
                ||d.slots().isEmpty()||d.slots().size()>5||d.slots().stream().anyMatch(s->s==null||!SLOTS.contains(s))
                ||d.slots().stream().distinct().count()!=d.slots().size()) throw SkinException.invalid("상품 코드·이름·등급·착용 정보를 확인해주세요.");
        long clothes=d.slots().stream().filter(s->List.of("TOP","BOTTOM","SHOES").contains(s)).count();
        if(clothes!=0&&clothes!=3) throw SkinException.invalid("옷은 상의·하의·신발을 한 벌로 등록해주세요.");
        if(d.wearMode().equals("WHOLE")&&d.slots().size()!=5)
            throw SkinException.invalid("통합 스킨은 5개 부위를 함께 등록해주세요.");
        return new Definition(d.productCode(),d.name().trim(),d.grade(),d.compatibility(),d.wearMode(),
                SLOTS.stream().filter(d.slots()::contains).toList());
    }
    public static Definition modelDefinition(Definition d,String compatibility) {
        return new Definition(d.productCode(),d.name(),d.grade(),compatibility,d.wearMode(),d.slots());
    }
    public static void femaleModel(Definition d,FileSpec file) {
        if(file!=null&&!d.compatibility().equals("ANY"))
            throw SkinException.invalid("별도 여성용 모델은 남녀 공용 아이템에서 등록할 수 있어요.");
    }
    public static void file(FileSpec file,String extension,long max) {
        if(file==null||file.name()==null||!file.name().toLowerCase(java.util.Locale.ROOT).endsWith(extension)
                ||file.bytes()<(extension.equals(".glb")?20:12)||file.bytes()>max||file.sha256()==null
                ||!file.sha256().matches("[0-9a-f]{64}")) throw SkinException.invalid("파일 형식·크기·SHA-256을 확인해주세요.");
    }
    public static void version(long v) { if(v<0) throw SkinException.invalid("상태 버전을 확인해주세요."); }
    public static String id(String id) {
        try { if(!java.util.UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException(); return id; }
        catch(RuntimeException e) { throw SkinException.invalid("등록 ID를 확인해주세요."); }
    }
}
