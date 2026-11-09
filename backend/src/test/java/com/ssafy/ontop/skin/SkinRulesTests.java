package com.ssafy.ontop.skin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.skin.SkinDtos.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class SkinRulesTests {
    @Test void unisex_parts_must_have_visible_pieces_for_both_variants() {
        var d=new Definition("ABC","공용 모자",3,"ANY","PARTS",List.of("HAIR"));
        assertThatThrownBy(()->SkinFileValidator.requireParts(Set.of("item__HAIR__a__for_man"),d)).isInstanceOf(SkinException.class);
        SkinFileValidator.requireParts(Set.of("item__HAIR__a__for_man","item__HAIR__a__for_girl"),d);
        SkinFileValidator.requireParts(Set.of("item__HAIR__a"),d);
    }
    private Definition whole() { return new Definition("SPRING_SET","봄꽃 한복",2,"MALE","WHOLE",SkinRules.SLOTS); }
    @Test void whole_and_clothing_require_complete_slots() {
        assertThat(SkinRules.validate(whole()).slots()).hasSize(5);
        assertThat(SkinRules.validate(new Definition("ABC","옷",1,"ANY","WHOLE",SkinRules.SLOTS)).compatibility()).isEqualTo("ANY");
        assertThatThrownBy(()->SkinRules.validate(new Definition("ABC","옷",1,"MALE","PARTS",List.of("TOP")))).isInstanceOf(SkinException.class);
        assertThatThrownBy(()->SkinRules.validate(new Definition("ABC","옷",1,"MALE","PARTS",List.of("HAIR","HAIR")))).isInstanceOf(SkinException.class);
    }
    @Test void separate_female_file_is_only_for_paired_whole_skins() {
        var paired=new Definition("ABC","한복",1,"ANY","WHOLE",SkinRules.SLOTS);
        var female=new FileSpec("female.glb",20,"a".repeat(64));
        SkinRules.femaleModel(paired,female);
        assertThatThrownBy(()->SkinRules.femaleModel(whole(),female)).isInstanceOf(SkinException.class);
        assertThatThrownBy(()->SkinRules.femaleModel(new Definition("ABC","모자",1,"ANY","PARTS",List.of("HAIR")),female)).isInstanceOf(SkinException.class);
    }
    @Test void paths_limits_hashes_and_ids_are_not_client_controlled() {
        SkinRules.file(new FileSpec("skin.glb",20,"a".repeat(64)),".glb",20);
        assertThatThrownBy(()->SkinRules.file(new FileSpec("skin.glb",21,"a".repeat(64)),".glb",20)).isInstanceOf(SkinException.class);
        assertThatThrownBy(()->SkinRules.id("../../file")).isInstanceOf(SkinException.class);
        assertThatThrownBy(()->new SkinSettings("","","http://invalid","dev",301,20,12,Set.of())).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void current_real_whole_skin_and_webp_are_accepted_but_hash_and_file_spoofing_fail() throws Exception {
        byte[] model=Files.readAllBytes(Path.of("../frontend/public/art/characters/skins/ssafy-black-male-v3.glb"));
        byte[] image=Files.readAllBytes(Path.of("../frontend/src/assets/entry/yeopjeon-icon.webp"));
        var validator=new SkinFileValidator(new ObjectMapper());
        validator.validate(model,image,whole(),SkinFileValidator.sha256(model),SkinFileValidator.sha256(image));
        validator.validate(model,image,SkinRules.modelDefinition(whole(),"ANY"),SkinFileValidator.sha256(model),SkinFileValidator.sha256(image));
        assertThatThrownBy(()->validator.validate(model,image,SkinRules.modelDefinition(whole(),"FEMALE"),SkinFileValidator.sha256(model),SkinFileValidator.sha256(image))).isInstanceOf(SkinException.class);
        assertThatThrownBy(()->validator.validate(model,image,whole(),"0".repeat(64),SkinFileValidator.sha256(image))).isInstanceOf(SkinException.class);
        byte[] fake="not a glb".getBytes();
        assertThatThrownBy(()->validator.validate(fake,image,whole(),SkinFileValidator.sha256(fake),SkinFileValidator.sha256(image))).isInstanceOf(SkinException.class);
    }
    @Test void incomplete_external_models_and_unconfigured_aws_do_not_succeed() {
        var settings=new SkinSettings("","ap-northeast-2","","dev",300,20_971_520,2_097_152,Set.of(1L));
        try(var storage=new S3SkinStorage(settings)) {
            assertThat(storage.ready()).isFalse();
            assertThatThrownBy(()->storage.upload("anything",new FileSpec("a.glb",20,"0".repeat(64)),"model/gltf-binary"))
                    .isInstanceOf(SkinException.class).hasMessageContaining("S3");
        }
        assertThatThrownBy(()->settings.requireAdmin(2)).isInstanceOf(SkinException.class);
    }
    @Test void missing_binary_chunk_is_rejected_even_when_length_and_hash_are_updated() throws Exception {
        byte[] model=Files.readAllBytes(Path.of("../frontend/public/art/characters/skins/ssafy-black-male-v3.glb"));
        var header=java.nio.ByteBuffer.wrap(model).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        byte[] truncated=java.util.Arrays.copyOf(model,20+header.getInt(12));
        java.nio.ByteBuffer.wrap(truncated).order(java.nio.ByteOrder.LITTLE_ENDIAN).putInt(8,truncated.length);
        byte[] image=Files.readAllBytes(Path.of("../frontend/src/assets/entry/yeopjeon-icon.webp"));
        assertThatThrownBy(()->new SkinFileValidator(new ObjectMapper()).validate(truncated,image,whole(),
                SkinFileValidator.sha256(truncated),SkinFileValidator.sha256(image))).isInstanceOf(SkinException.class);
    }
}
