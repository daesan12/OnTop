package com.ssafy.ontop.skin;

import java.time.Instant;
import java.util.List;

public final class SkinSetDtos {
    private SkinSetDtos() { }
    public record Definition(String productCode,String name,int grade,String compatibility,
                             String imageSkinId,List<String> itemIds) { }
    public record Save(long version,Definition definition) { }
    public record Entry(String id,Definition definition,String state,long version,Instant publishedAt) { }
}
