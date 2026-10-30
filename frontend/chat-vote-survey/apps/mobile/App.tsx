import { StatusBar, StyleSheet } from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { WebAppView } from "./src/webview/WebAppView";

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar backgroundColor="#f5f7fb" barStyle="dark-content" />
      <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
        <WebAppView />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
});
