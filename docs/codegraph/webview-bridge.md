**Exploration: WebToNativeMessage가 apps/web에서 생성되어 packages/bridge를 거쳐 apps/mobile WebAppView에서 처리되는 흐름**

Found 5 symbols across 1 file.

**Blast radius — what depends on these (update/verify before editing)**

- `WebAppView` (apps/mobile/src/webview/WebAppView.tsx:51) — 2 callers in `apps/mobile/App.tsx`; ⚠️ no covering tests found
- `WebToNativeMessage` (packages/bridge/src/index.ts:134) — 6 callers in `apps/mobile/src/webview/WebAppView.tsx`, `apps/web/lib/native/bridge-client.ts`, `packages/bridge/src/index.ts`; tests: `packages/bridge/src/index.test.ts`

**Source Code**

> The code below is the **verbatim, current on-disk source** of these files — re-read from disk on this call and line-numbered, byte-for-byte identical to what the Read tool returns. It is NOT a summary, outline, or stale cache. Treat each block as a Read you have already performed: do not Read a file shown here.

**`apps/mobile/src/webview/WebAppView.tsx`** — imports(imports), createBridgeId(calls), openExternalUrl(calls), startNativeAuth(imports), downloadAndShareFile(imports), +18 more

```tsx
25	  View,
26	} from "react-native";
27	import { WebView } from "react-native-webview";
28	import { startNativeAuth } from "../auth/native-auth";
29	import {
30	  DOWNLOADS_ENABLED,
31	  OAUTH_ENABLED,
32	  PUSH_ENABLED,
33	  WEB_APP_ORIGIN,
34	  WEB_APP_URL,
35	} from "../config/runtime";
36	import { downloadAndShareFile } from "../downloads/native-download";
37	import {
38	  configureForegroundNotifications,
39	  registerForPushNotifications,
40	  subscribeNotificationLinks,
41	} from "../notifications/native-notifications";
42	import { normalizeDeepLink } from "./deep-link";
43	
44	type WebViewHandle = ElementRef<typeof WebView>;
45	
46	type LoadFailure = {
47	  title: string;
48	  detail: string;
49	};
50	
51	export function WebAppView() {
52	  const webViewRef = useRef<WebViewHandle>(null);
53	  const pendingDeepLinkRef = useRef<string | null>(null);
54	  const webReadyRef = useRef(false);
55	  const [webViewKey, setWebViewKey] = useState(0);
56	  const [canGoBack, setCanGoBack] = useState(false);
57	  const [loading, setLoading] = useState(true);
58	  const [failure, setFailure] = useState<LoadFailure | null>(null);
59	
60	  const nativeContext = useMemo<NativeContext>(() => {
61	    const capabilities: NativeCapability[] = ["share", "deep-link", "app-state"];
62	    if (OAUTH_ENABLED) {
63	      capabilities.push("oauth");
64	    }
65	    if (DOWNLOADS_ENABLED) {
66	      capabilities.push("download");
67	    }
68	    if (PUSH_ENABLED) {
69	      capabilities.push("push");
70	    }
71	
72	    return {
73	      platform: Platform.OS === "ios" ? "ios" : "android",
74	      appVersion: Application.nativeApplicationVersion ?? "development",
75	      buildVersion: Application.nativeBuildVersion ?? "development",
76	      capabilities,
77	    };
78	  }, []);
79	
80	  const postToWeb = useCallback((message: NativeToWebMessage) => {
81	    const serialized = serializeBridgeMessage(message);
82	    const safeJavaScriptString = JSON.stringify(serialized).replace(/</g, "\\u003c");
83	
84	    webViewRef.current?.injectJavaScript(`
85	      window.dispatchEvent(
86	        new CustomEvent(${JSON.stringify(NATIVE_TO_WEB_EVENT)}, {
87	          detail: ${safeJavaScriptString}
88	        })
89	      );
90	      true;
91	    `);
92	  }, []);
93	
94	  const postError = useCallback(
95	    (request: WebToNativeMessage | null, code: string, message: string) => {
96	      postToWeb({
97	        version: BRIDGE_VERSION,
98	        id: request?.id ?? createBridgeId("native"),
99	        sentAt: Date.now(),
100	        type: "BRIDGE_ERROR",
101	        payload: {
102	          code,
103	          message,
104	          requestType: request?.type,
105	        },
106	      });
107	    },
108	    [postToWeb],
109	  );
110	
111	  const handleBridgeRequest = useCallback(
112	    async (raw: string) => {
113	      const request = parseWebToNativeMessage(raw);
114	      if (!request) {
115	        postError(null, "INVALID_MESSAGE", "Bridge message validation failed.");
116	        return;
117	      }
118	
119	      switch (request.type) {
120	        case "WEB_READY": {
121	          webReadyRef.current = true;
122	          postToWeb({
123	            version: BRIDGE_VERSION,
124	            id: request.id,
125	            sentAt: Date.now(),
126	            type: "NATIVE_READY",
127	            payload: nativeContext,
128	          });
129	
130	          if (pendingDeepLinkRef.current) {
131	            const url = pendingDeepLinkRef.current;
132	            pendingDeepLinkRef.current = null;
133	            postToWeb({
134	              version: BRIDGE_VERSION,
135	              id: createBridgeId("native"),
136	              sentAt: Date.now(),
137	              type: "DEEP_LINK",
138	              payload: { url },
139	            });
140	          }
141	          return;
142	        }
143	
144	        case "GET_NATIVE_CONTEXT":
145	          postToWeb({
146	            version: BRIDGE_VERSION,
147	            id: request.id,
148	            sentAt: Date.now(),
149	            type: "NATIVE_CONTEXT",
150	            payload: nativeContext,
151	          });
152	          return;
153	
154	        case "SHARE": {
155	          try {
156	            const message = [request.payload.text, request.payload.url].filter(Boolean).join("\n");
157	            const result = await Share.share({
158	              title: request.payload.title,
159	              message: message || request.payload.title || "",
160	            });
161	
162	            postToWeb({
163	              version: BRIDGE_VERSION,
164	              id: request.id,
165	              sentAt: Date.now(),
166	              type: "SHARE_RESULT",
167	              payload: {
168	                completed: result.action === Share.sharedAction,
169	              },
170	            });
171	          } catch (cause) {
172	            postError(
173	              request,
174	              "SHARE_FAILED",
175	              cause instanceof Error ? cause.message : "Native share failed.",
176	            );
177	          }
178	          return;
179	        }
180	
181	        case "START_OAUTH": {
182	          if (!OAUTH_ENABLED) {
183	            postError(request, "OAUTH_DISABLED", "Native OAuth is disabled.");
184	            return;
185	          }
186	
187	          try {
188	            const result = await startNativeAuth(request.payload.url, request.payload.callbackUrl);
189	            if (result.type === "success") {
190	              postToWeb({
191	                version: BRIDGE_VERSION,
192	                id: request.id,
193	                sentAt: Date.now(),
194	                type: "AUTH_RESULT",
195	                payload: { callbackUrl: result.callbackUrl },
196	              });
197	            } else {
198	              postToWeb({
199	                version: BRIDGE_VERSION,
200	                id: request.id,
201	                sentAt: Date.now(),
202	                type: "AUTH_CANCELLED",
203	                payload: {},
204	              });
205	            }
206	          } catch (cause) {
207	            postError(
208	              request,
209	              "OAUTH_FAILED",
210	              cause instanceof Error ? cause.message : "Native OAuth failed.",
211	            );
212	          }
213	          return;
214	        }
215	
216	        case "DOWNLOAD_FILE": {
217	          if (!DOWNLOADS_ENABLED) {
218	            postError(request, "DOWNLOADS_DISABLED", "Native downloads are disabled.");
219	            return;
220	          }
221	
222	          try {
223	            const fileName = await downloadAndShareFile(request.payload);
224	            postToWeb({
225	              version: BRIDGE_VERSION,
226	              id: request.id,
227	              sentAt: Date.now(),
228	              type: "DOWNLOAD_RESULT",
229	              payload: {
230	                completed: true,
231	                fileName,
232	              },
233	            });
234	          } catch (cause) {
235	            postError(
236	              request,
237	              "DOWNLOAD_FAILED",
238	              cause instanceof Error ? cause.message : "Native download failed.",
239	            );
240	          }
241	          return;
242	        }
243	
244	        case "REQUEST_PUSH_PERMISSION": {
245	          const result = await registerForPushNotifications();
246	          postToWeb({
247	            version: BRIDGE_VERSION,
248	            id: request.id,
249	            sentAt: Date.now(),
250	            type: "PUSH_REGISTRATION_RESULT",
251	            payload: result,
252	          });
253	          return;
254	        }
255	      }
256	    },
257	    [nativeContext, postError, postToWeb],
258	  );
259	
260	  const sendDeepLink = useCallback(
261	    (rawUrl: string) => {
262	      const url = normalizeDeepLink(rawUrl);
263	      if (!url) {
264	        return;
265	      }
266	
267	      if (!webReadyRef.current) {
268	        pendingDeepLinkRef.current = url;
269	        return;
270	      }
271	
272	      postToWeb({
273	        version: BRIDGE_VERSION,
274	        id: createBridgeId("native"),
275	        sentAt: Date.now(),
276	        type: "DEEP_LINK",
277	        payload: { url },
278	      });
279	    },
280	    [postToWeb],
281	  );
282	
283	  useEffect(() => {
284	    void Linking.getInitialURL().then((url) => {
285	      if (url) {
286	        sendDeepLink(url);
287	      }
288	    });
289	
290	    const subscription = Linking.addEventListener("url", ({ url }) => sendDeepLink(url));
291	    return () => subscription.remove();
292	  }, [sendDeepLink]);
293	
294	  useEffect(() => {
295	    if (!PUSH_ENABLED) {
296	      return;
297	    }
298	
299	    configureForegroundNotifications();
300	    return subscribeNotificationLinks(sendDeepLink);
301	  }, [sendDeepLink]);
302	
303	  useEffect(() => {
304	    const subscription = AppState.addEventListener("change", (state) => {
305	      if (!webReadyRef.current) {
306	        return;
307	      }
308	
309	      postToWeb({
310	        version: BRIDGE_VERSION,
311	        id: createBridgeId("native"),
312	        sentAt: Date.now(),
313	        type: "APP_STATE_CHANGED",
314	        payload: { state: normalizeAppState(state) },
315	      });
316	    });
317	
318	    return () => subscription.remove();
319	  }, [postToWeb]);
320	
321	  useEffect(() => {
322	    if (Platform.OS !== "android") {
323	      return;
324	    }
325	
326	    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
327	      if (!canGoBack) {
328	        return false;
329	      }
330	
331	      webViewRef.current?.goBack();
332	      return true;
333	    });
334	
335	    return () => subscription.remove();
336	  }, [canGoBack]);
337	
338	  const handleLoadEnd = () => {
339	    setLoading(false);
340	    setFailure(null);
341	  };
342	
343	  const retry = () => {
344	    setFailure(null);
345	    setLoading(true);
346	    webReadyRef.current = false;
347	    setWebViewKey((value) => value + 1);
348	  };
349	
350	  return (
351	    <View style={styles.container}>
352	      <WebView
353	        key={webViewKey}
354	        ref={webViewRef}
355	        applicationNameForUserAgent={`${Application.applicationName ?? "NextWebViewShell"}/${
356	          Application.nativeApplicationVersion ?? "development"
357	        }`}
358	        allowsBackForwardNavigationGestures
359	        allowsInlineMediaPlayback
360	        cacheEnabled
361	        domStorageEnabled
362	        javaScriptCanOpenWindowsAutomatically={false}
363	        javaScriptEnabled
364	        mediaPlaybackRequiresUserAction
365	        mixedContentMode="never"
366	        onError={(event) => {
367	          setLoading(false);
368	          setFailure({
369	            title: "웹 애플리케이션에 연결하지 못했습니다.",
370	            detail: event.nativeEvent.description,
371	          });
372	        }}
373	        onLoadEnd={handleLoadEnd}
374	        onLoadStart={() => {
375	          setLoading(true);
376	          webReadyRef.current = false;
377	        }}
378	        onMessage={(event) => void handleBridgeRequest(event.nativeEvent.data)}
379	        onNavigationStateChange={(navigation) => setCanGoBack(navigation.canGoBack)}
380	        onOpenWindow={(event) => {
381	          void openExternalUrl(event.nativeEvent.targetUrl);
382	        }}
383	        onShouldStartLoadWithRequest={(request) => {
384	          const { url } = request;
385	
386	          if (url === "about:blank" || url.startsWith(`blob:${WEB_APP_ORIGIN}`)) {
387	            return true;
388	          }
389	
390	          try {
391	            if (new URL(url).origin === WEB_APP_ORIGIN) {
392	              return true;
393	            }
394	          } catch {
395	            // Non-HTTP schemes are delegated to the operating system below.
396	          }
397	
398	          void openExternalUrl(url);
399	          return false;
400	        }}
401	        originWhitelist={["http://*", "https://*"]}
402	        pullToRefreshEnabled={Platform.OS === "ios"}
403	        sharedCookiesEnabled
404	        source={{ uri: WEB_APP_URL }}
405	        thirdPartyCookiesEnabled={false}
406	      />
407	
408	      {loading && !failure ? (
409	        <View accessibilityRole="progressbar" style={[StyleSheet.absoluteFill, styles.overlay]}>
410	          <ActivityIndicator size="large" />
411	          <Text style={styles.overlayText}>Next.js를 불러오는 중…</Text>
412	        </View>
413	      ) : null}
414	
415	      {failure ? (
416	        <View accessibilityRole="alert" style={[StyleSheet.absoluteFill, styles.overlay]}>
417	          <Text style={styles.errorTitle}>{failure.title}</Text>
418	          <Text style={styles.errorDetail}>{failure.detail}</Text>
419	          <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
420	            <Text style={styles.retryButtonText}>다시 시도</Text>
421	          </Pressable>
422	        </View>
423	      ) : null}
424	    </View>
425	  );
426	}
427	
428	async function openExternalUrl(rawUrl: string): Promise<void> {
429	  try {
430	    const parsed = new URL(rawUrl);
431	    const allowed =
432	      parsed.protocol === "https:" ||
433	      (__DEV__ && parsed.protocol === "http:") ||
434	      parsed.protocol === "mailto:" ||
435	      parsed.protocol === "tel:" ||
436	      parsed.protocol === "sms:";
437	
438	    if (!allowed || !(await Linking.canOpenURL(rawUrl))) {
439	      return;
440	    }
441	
442	    await Linking.openURL(rawUrl);
443	  } catch {
444	    // Ignore malformed or unsupported external URLs.
445	  }
446	}
447	
448	function normalizeAppState(
449	  state: AppStateStatus,
450	): "active" | "background" | "inactive" | "unknown" {
451	  if (state === "active" || state === "background" || state === "inactive") {
452	    return state;
453	  }
454	
455	  return "unknown";
456	}
457	
458	const styles = StyleSheet.create({
459	  container: {
```


... (output truncated to budget; the source above is complete and verbatim — treat it as already Read. For any area not covered, run another codegraph_explore with the specific names — do NOT Read these files.)
