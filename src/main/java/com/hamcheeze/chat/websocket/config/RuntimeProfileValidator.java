package com.hamcheeze.chat.websocket.config;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.Ordered;
import org.springframework.core.PriorityOrdered;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

@Component
public final class RuntimeProfileValidator
        implements BeanDefinitionRegistryPostProcessor,
        EnvironmentAware,
        PriorityOrdered {

    private static final Set<String> SUPPORTED_RUNTIME_PROFILES =
            Set.of("local", "prod");

    private Environment environment;

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(
            BeanDefinitionRegistry registry
    ) throws BeansException {
        String[] activeProfiles = environment == null
                ? new String[0]
                : environment.getActiveProfiles();
        List<String> activeRuntimeProfiles = Arrays.stream(activeProfiles)
                .filter(SUPPORTED_RUNTIME_PROFILES::contains)
                .toList();
        if (activeRuntimeProfiles.size() != 1) {
            throw new IllegalStateException(
                    "Exactly one runtime Spring profile must be active: "
                            + SUPPORTED_RUNTIME_PROFILES
                            + ", runtime="
                            + activeRuntimeProfiles
                            + ", active="
                            + Arrays.toString(activeProfiles));
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

}
