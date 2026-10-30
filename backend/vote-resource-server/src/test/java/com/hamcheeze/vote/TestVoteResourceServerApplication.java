package com.hamcheeze.vote;

import org.springframework.boot.SpringApplication;

public class TestVoteResourceServerApplication {

	public static void main(String[] args) {
		SpringApplication.from(VoteResourceServerApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
