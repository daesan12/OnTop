package com.ssafy.ontop.skin;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/** Records executed SQL in the isolated MySQL test, without bind values or new dependencies. */
final class SqlProbe {
    final List<String> statements=new ArrayList<>();
    final JdbcTemplate jdbc;
    SqlProbe(DataSource source) {
        jdbc=new JdbcTemplate(new DelegatingDataSource(source) {
            @Override public Connection getConnection() throws java.sql.SQLException {
                Connection target=super.getConnection();
                return (Connection)Proxy.newProxyInstance(Connection.class.getClassLoader(),new Class<?>[]{Connection.class},(p,m,a)->{
                    Object result=invoke(target,m,a);
                    if(result instanceof Statement statement) {
                        String prepared=a!=null&&a.length>0&&a[0] instanceof String?(String)a[0]:null;
                        Class<?> type=statement instanceof PreparedStatement?PreparedStatement.class:Statement.class;
                        return Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},(sp,sm,sa)->{
                            if(sm.getName().startsWith("execute"))
                                statements.add(prepared!=null?prepared:sa!=null&&sa.length>0?String.valueOf(sa[0]):sm.getName());
                            return invoke(statement,sm,sa);
                        });
                    }
                    return result;
                });
            }
        });
    }
    private static Object invoke(Object target,Method method,Object[] args) throws Throwable {
        try { return method.invoke(target,args); }
        catch(InvocationTargetException failure) { throw failure.getCause(); }
    }
}
