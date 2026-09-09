# Deferred registration cleanup reproduction

This branch starts with the fix from PR #1613. The example removes a keyboard
handler consumer during a parent layout effect, before deferred registration runs.
There are no mocked native tags or artificial registration delays.

## Setup

```sh
git clone --branch repro/deferred-registration-cleanup https://github.com/JoaoPauloCMarra/react-native-keyboard-controller.git
cd react-native-keyboard-controller
yarn install --frozen-lockfile
(cd FabricExample && yarn install --frozen-lockfile)
(cd FabricExample/ios && pod install)
```

The checked-in Pod lock had stale checksums in the tested setup; plain `pod install`
was needed. The native build used fresh Pods and DerivedData, but the JavaScript
dependencies were already installed. A completely fresh clone was not tested.

Start Metro in one terminal:

```sh
cd FabricExample
yarn start --port 8081
```

In another terminal, from the repository root, select an available iPhone simulator
from `xcrun simctl list devices available` and replace `YOUR_SIMULATOR_UDID` below:

```sh
SIMULATOR_ID=YOUR_SIMULATOR_UDID
xcodebuild -workspace FabricExample/ios/KeyboardControllerFabricExample.xcworkspace \
  -scheme KeyboardControllerFabricExample -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  -derivedDataPath /tmp/rnkc-registration-repro CODE_SIGNING_ALLOWED=NO build
xcrun simctl install "$SIMULATOR_ID" \
  /tmp/rnkc-registration-repro/Build/Products/Debug-iphonesimulator/KeyboardControllerFabricExample.app
xcrun simctl launch "$SIMULATOR_ID" \
  org.reactjs.native.example.KeyboardControllerFabricExample
```

## Compare original and fixed behavior

To run the original implementation, use this from the repository root:

```sh
git show af130ca4:src/internal.ts > src/internal.ts
```

Wait for Metro to process the file change, then reload the app from Metro with `r`.

1. Start with the keyboard closed.
2. Tap **Unmount consumer during layout**.
3. Wait for **Consumer has unmounted**.
4. Tap **Control input without a handler**.
5. The original implementation increases **After unmount**: a removed consumer
   still receives keyboard callbacks.
6. **Unmount provider during layout** also produces the unresolved view tag warning.

Restore the fixed implementation and reload again:

```sh
git restore --source=HEAD -- src/internal.ts
```

Repeat the same steps. **After unmount** stays at zero and provider teardown does
not warn. Select **Normal consumer** and focus its input to check live callbacks.

## Results and scope

- iPhone 17 Pro Max simulator, iOS 26.5, Xcode 26.6, Debug, Fabric and Hermes.
- React Native 0.81.4, React 19.1.0, Reanimated 4.2.1, Worklets 0.7.1.
- Original code: 51 of 51 teardown mounts attached after cleanup.
- Cleanup guard: 0 of 51 teardown mounts attached after cleanup.
- A revert to the original code brought back the stale callback; restoring the
  guard removed it again.
- Normal, Strict Mode, and scroll/toolbar remount checks also passed locally.
- RN 0.86.3, Android, Paper, and release builds were not tested natively.

This proves a deferred registration cleanup race. It does not establish a late
native tag on a mounted provider or the cause of the original app's UI symptoms.
