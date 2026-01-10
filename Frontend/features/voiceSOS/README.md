# Voice SOS Module

This module provides on-device voice keyword detection for emergency situations. It uses `expo-av` for recording and `tfjs` for keyword detection (mocked for MVP).

## Features
- **VAD (Voice Activity Detection)**: Energy-based detection to filter silence.
- **Whisper Detection**: Amplitude normalization to boost low-volume speech.
- **Privacy**: No audio streaming to server. Only processes locally.
- **Hook API**: Simple `useVoiceSOS` hook for integration.

## Installation

Ensure the following dependencies are installed:
```bash
npm install @tensorflow/tfjs @tensorflow/tfjs-react-native expo-gl expo-file-system @react-native-async-storage/async-storage
```

## Usage

```typescript
import useVoiceSOS from 'app/features/voiceSOS/useVoiceSOS';

const MyComponent = () => {
  const { startListening, stopListening, isListening } = useVoiceSOS({
    onKeywordDetected: (info) => {
      console.log('Emergency detected:', info.keyword);
      // Trigger SOS flow here
    },
    onError: (err) => console.error(err),
  });

  return (
    <Button onPress={isListening ? stopListening : startListening} title="Toggle Voice SOS" />
  );
};
```

## Configuration
- **Thresholds**: Adjust `VAD_THRESHOLD` and `CONFIDENCE_THRESHOLD` in `voiceUtils.ts` and `useVoiceSOS.ts` as needed.
- **Model**: Place your TFJS model in `voiceModel/` and uncomment the loading logic in `useVoiceSOS.ts`.

## Testing
Import `VoiceSOSDemo` from `app/features/voiceSOS/VoiceSOSDemo.tsx` to test the functionality visually.
