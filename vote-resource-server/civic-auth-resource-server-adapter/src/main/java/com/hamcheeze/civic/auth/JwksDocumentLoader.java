package com.hamcheeze.civic.auth;

import java.io.IOException;

@FunctionalInterface
interface JwksDocumentLoader {

    String load() throws IOException, InterruptedException;
}
