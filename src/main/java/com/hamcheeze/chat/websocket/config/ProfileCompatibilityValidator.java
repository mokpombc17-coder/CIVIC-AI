package com.hamcheeze.chat.websocket.config;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.Ordered;
import org.springframework.core.PriorityOrdered;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public final class ProfileCompatibilityValidator
        implements BeanDefinitionRegistryPostProcessor,
        EnvironmentAware,
        PriorityOrdered {

    private Environment environment;

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(
            BeanDefinitionRegistry registry
    ) throws BeansException {
        boolean prod = active("prod");
        boolean skeleton = active("skeleton");
        boolean limitTest = active("limit-test");
        if (prod && skeleton || prod && limitTest || skeleton && limitTest) {
            throw new IllegalStateException(
                    "Incompatible profiles: prod, skeleton, and limit-test "
                            + "must be activated exclusively");
        }
    }

    @Override
    public void postProcessBeanFactory(
            ConfigurableListableBeanFactory beanFactory
    ) throws BeansException {
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    private boolean active(String profile) {
        return environment != null
                && environment.acceptsProfiles(Profiles.of(profile));
    }
}
