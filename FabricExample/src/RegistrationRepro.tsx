import React, {
  StrictMode,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
} from "react";
import {
  Button,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardProvider,
  KeyboardToolbar,
  useKeyboardHandler,
} from "react-native-keyboard-controller";
import { runOnJS } from "react-native-reanimated";

type Mode = "normal" | "consumer" | "provider" | "scroll";
type Trace = {
  event: string;
  time: number;
  id?: number | string;
  hasRef?: boolean;
  tag?: number | null;
  height?: number;
  afterUnmount?: boolean;
};
const runtime = globalThis as typeof globalThis & {
  __rnkcTrace: Trace[];
  __rnkcRemount: () => void;
  __rnkcStrict: (value: boolean) => void;
  __rnkcMode: (value: Mode) => void;
  __rnkcDismiss: () => void;
};

runtime.__rnkcTrace = [];
const mounted = new Set<string>();
const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 80, paddingHorizontal: 20 },
  input: { borderWidth: 1, padding: 16, marginVertical: 8 },
});

function recordEvent(id: string, height: number) {
  runtime.__rnkcTrace.push({
    event: "keyboard",
    id,
    height,
    afterUnmount: !mounted.has(id),
    time: performance.now(),
  });
}

function Consumer() {
  const id = useId();

  useKeyboardHandler(
    {
      onEnd: (event) => {
        "worklet";
        runOnJS(recordEvent)(id, event.height);
      },
    },
    [],
  );
  useLayoutEffect(() => {
    mounted.add(id);

    return () => {
      mounted.delete(id);
    };
  }, [id]);

  return (
    <TextInput
      placeholder="Live consumer input"
      style={styles.input}
      testID="repro-input"
    />
  );
}

function Case({ mode }: { mode: Mode }) {
  const [show, setShow] = useState(true);

  useLayoutEffect(() => {
    if (mode === "consumer" || mode === "provider") {
      setShow(false);
    }
  }, [mode]);

  if (mode === "provider" && !show) {
    return <Text>Provider and consumer have unmounted</Text>;
  }

  return (
    <KeyboardProvider preload={false}>
      {show ? <Consumer /> : <Text>Consumer has unmounted</Text>}
      {mode === "scroll" ? (
        <KeyboardAwareScrollView>
          <TextInput placeholder="Scroll input" style={styles.input} />
          <KeyboardToolbar />
        </KeyboardAwareScrollView>
      ) : (
        <TextInput
          placeholder="Control input without a handler"
          style={styles.input}
          testID="control-input"
        />
      )}
    </KeyboardProvider>
  );
}
export default function RegistrationRepro() {
  const [cycle, setCycle] = useState(0);
  const [strict, setStrict] = useState(false);
  const [mode, setMode] = useState<Mode>("normal");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    runtime.__rnkcRemount = () => setCycle((value) => value + 1);
    runtime.__rnkcStrict = setStrict;
    runtime.__rnkcMode = setMode;
    runtime.__rnkcDismiss = Keyboard.dismiss;
    const timer = setInterval(() => {
      const events = runtime.__rnkcTrace.filter(
        (event) => event.event === "keyboard",
      );

      setSummary(
        "Live callbacks: " +
          events.filter((event) => !event.afterUnmount).length +
          " / After unmount: " +
          events.filter((event) => event.afterUnmount).length,
      );
    }, 200);

    return () => clearInterval(timer);
  }, []);
  const provider = <Case key={mode + cycle} mode={mode} />;

  return (
    <View style={styles.root}>
      <Text>Issue 1612: native lifecycle reproduction</Text>
      <Text>
        Mode: {mode} / cycle {cycle} / strict {String(strict)}
      </Text>
      <Text testID="callback-counts">{summary}</Text>
      <Button title="Normal consumer" onPress={() => setMode("normal")} />
      <Button
        title="Unmount consumer during layout"
        onPress={() => setMode("consumer")}
      />
      <Button
        title="Unmount provider during layout"
        onPress={() => setMode("provider")}
      />
      <Button title="Remount" onPress={() => setCycle((value) => value + 1)} />
      <Button title="Dismiss keyboard" onPress={Keyboard.dismiss} />
      {strict ? <StrictMode>{provider}</StrictMode> : provider}
    </View>
  );
}
