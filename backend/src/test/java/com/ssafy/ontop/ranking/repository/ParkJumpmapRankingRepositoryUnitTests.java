package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.Instant;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ParkJumpmapRankingRepositoryUnitTests {
    @Test
    void 실행중인_리뉴얼_코스의_버전과_구간수로_조회한다() throws Exception {
        EntityManager entities = mock(EntityManager.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<WorldMapRuntime> runtimes = mock(ObjectProvider.class);
        WorldMapRuntime runtime = mock(WorldMapRuntime.class);
        JumpCourse course = mock(JumpCourse.class);
        Query query = mock(Query.class);
        when(runtimes.getIfAvailable()).thenReturn(runtime);
        when(runtime.loadJumpCourse()).thenReturn(course);
        when(course.stageCount()).thenReturn(10);
        when(course.rulesVersion()).thenReturn("v4");
        when(course.courseVersion()).thenReturn("park220-jump10-v1");
        when(course.renewal()).thenReturn(true);
        when(entities.createNativeQuery(anyString(), eq(Object[].class))).thenReturn(query);
        when(query.setParameter(anyString(), org.mockito.ArgumentMatchers.any())).thenReturn(query);
        when(query.getResultStream()).thenReturn(Stream.empty());

        var repository = new ParkJumpmapRankingRepository(entities, runtimes);
        repository.findTopTen(Instant.parse("2026-11-16T07:00:00Z"));

        verify(query).setParameter("requiredGates", 10);
        verify(query).setParameter("rulesVersion", "v4");
        verify(query).setParameter("courseVersion", "park220-jump10-v1");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(entities).createNativeQuery(sql.capture(), eq(Object[].class));
        assertThat(sql.getValue()).contains("r.suspicious = FALSE").doesNotContain("JSON_SCHEMA_VALID");
    }
}
