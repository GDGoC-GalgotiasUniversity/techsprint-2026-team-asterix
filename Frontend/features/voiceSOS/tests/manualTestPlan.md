# Voice SOS Manual Test Plan

## Setup
1. Ensure dependencies are installed (`npm install`).
2. Run the app on a physical device or simulator (`npx expo start`).
3. Navigate to the Voice SOS Demo screen (you may need to add it to your navigation temporarily or import it in `app/index.tsx` to test).

## Test Cases

### 1. Permission Request
- **Action**: Tap "Start Listening".
- **Expected**: App requests microphone permission.
- **Pass**: Permission dialog appears and accepts "Allow".

### 2. VAD Trigger (Loud)
- **Action**: Speak loudly into the microphone ("HELP!").
- **Expected**: Log shows "Keyword detected" (since we are mocking the model pass on VAD trigger).
- **Pass**: Log appears with confidence score.

### 3. Whisper Trigger
- **Action**: Whisper "help" closely to the microphone.
- **Expected**: VAD should trigger due to normalization/amplification.
- **Pass**: Log appears with confidence score.

### 4. Silence Check
- **Action**: Start listening but stay silent.
- **Expected**: No "Keyword detected" logs. "No speech detected (VAD)" might appear in console if logging enabled.
- **Pass**: No false triggers in silence.

### 5. Stop Listening
- **Action**: Tap "Stop Listening".
- **Expected**: Status changes to "Idle". Speaking does not trigger logs.
- **Pass**: No events after stopping.

### 6. Background/Interruption (Optional)
- **Action**: Background the app while listening.
- **Expected**: Recording might pause or stop depending on OS.
- **Pass**: App handles resume gracefully or stops without crash.

## Troubleshooting
- If "Microphone permission not granted" error: Go to device settings and enable microphone for Expo Go.
- If "Error loading voice model": Check console for TFJS errors. Ensure `expo-gl` is installed.
