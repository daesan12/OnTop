package com.ssafy.ontop.world.repository;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.world.service.WorldProfileGateway;
import jakarta.persistence.EntityManager;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class JpaWorldProfileGateway implements WorldProfileGateway {
    private final EntityManager entities;
    private final AdminAccessPolicy administrators;

    public JpaWorldProfileGateway(EntityManager entities, AdminAccessPolicy administrators) {
        this.entities = entities;
        this.administrators = administrators;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, WorldProfileGateway.Profile> profiles(Set<Long> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        var rows = entities.createQuery("select u.id, u.nickname, u.characterGender from User u "
                + "where u.id in :ids and u.deletedAt is null", Object[].class)
                .setParameter("ids", Set.copyOf(userIds)).getResultList();
        Map<Long, WorldProfileGateway.Profile> profiles = new HashMap<>();
        for (Object[] row : rows) {
            profiles.put((Long) row[0], new WorldProfileGateway.Profile(
                    (String) row[1], ((CharacterGender) row[2]).name(), administrators.canRead((Long) row[0])));
        }
        return Map.copyOf(profiles);
    }
}
