package com.hamcheeze.civic.auth;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

final class HttpsJwksDocumentLoader implements JwksDocumentLoader {

    private final HttpClient httpClient;
    private final HttpRequest request;
    private final int maxDocumentBytes;

    HttpsJwksDocumentLoader(
            URI jwksUri,
            Duration connectTimeout,
            Duration requestTimeout,
            int maxDocumentBytes
    ) {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        this.request = HttpRequest.newBuilder(jwksUri)
                .timeout(requestTimeout)
                .header("Accept", "application/json")
                .GET()
                .build();
        this.maxDocumentBytes = maxDocumentBytes;
    }

    @Override
    public String load() throws IOException, InterruptedException {
        HttpResponse<InputStream> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream body = response.body()) {
            if (response.statusCode() != 200) {
                throw new IOException(
                        "JWKS endpoint returned an unexpected status");
            }
            byte[] bytes = body.readNBytes(maxDocumentBytes + 1);
            if (bytes.length > maxDocumentBytes) {
                throw new IOException("JWKS document exceeds configured limit");
            }
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }
}
