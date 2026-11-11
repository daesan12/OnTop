package com.ssafy.ontop.ailab;
import com.ssafy.ontop.ai.AiText;
public final class SpringAiText implements AiText {
 private final com.ssafy.ontop.ai.OpenAiText delegate;
 public SpringAiText(String key,String model,int dailyLimit){delegate=new com.ssafy.ontop.ai.OpenAiText(key,model,dailyLimit);}
 public Reply generate(String persona,String facts,String fallback){return delegate.generate(persona,facts,fallback);}
 public String mode(){return delegate.mode();}
 public java.util.Map<String,Long> usage(){return delegate.usage();}
}
