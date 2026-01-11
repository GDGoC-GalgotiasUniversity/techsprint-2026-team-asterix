import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

export const useVideoSOS = (options?: { onRecordingFinished?: (uri: string) => void }) => {
    const [permission, requestPermission] = useCameraPermissions();
    // const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions(); // ❌ Causes crash on Expo Go if Audio perm missing
    const [isRecording, setIsRecording] = useState(false);
    const cameraRef = useRef<CameraView>(null);
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const startRecording = useCallback(async () => {
        if (!permission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                Alert.alert("Permission Required", "Camera permission is needed for Video SOS.");
                return;
            }
        }

        // 🟢 Fix: Request WRITE-ONLY permission to avoid "READ_MEDIA_AUDIO" error
        const mediaPerm = await MediaLibrary.requestPermissionsAsync(true);
        if (!mediaPerm.granted) {
            Alert.alert("Permission Required", "Gallery access is needed to save video.");
            return;
        }

        if (cameraRef.current && !isRecording) {
            try {
                setIsRecording(true);
                console.log("[VideoSOS] Starting recording...");

                const videoPromise = cameraRef.current.recordAsync({
                    maxDuration: 15, // Stop automatically after 15s
                });

                // Save reference to stop it manually if needed
                // Note: recordAsync awaits until recording stops
                videoPromise.then(async (data) => {
                    console.log("[VideoSOS] Recording finished:", data?.uri);
                    setIsRecording(false);
                    if (data?.uri) {
                        try {
                            await MediaLibrary.saveToLibraryAsync(data.uri);
                            console.log("[VideoSOS] Video saved to gallery.");

                            // 🟢 Callback to parent
                            if (options?.onRecordingFinished) {
                                options.onRecordingFinished(data.uri);
                            }

                        } catch (e) {
                            console.error("[VideoSOS] Failed to save video:", e);
                        }
                    }
                }).catch(e => {
                    console.error("[VideoSOS] Recording error:", e);
                    setIsRecording(false);
                });

            } catch (error) {
                console.error("[VideoSOS] Failed to start recording:", error);
                setIsRecording(false);
            }
        }
    }, [permission, isRecording, options]);

    const stopRecording = useCallback(() => {
        if (cameraRef.current && isRecording) {
            console.log("[VideoSOS] Stopping recording manually...");
            cameraRef.current.stopRecording();
            setIsRecording(false);
        }
    }, [isRecording]);

    return {
        cameraRef,
        isRecording,
        startRecording,
        stopRecording,
        permission,
        requestPermission
    };
};
