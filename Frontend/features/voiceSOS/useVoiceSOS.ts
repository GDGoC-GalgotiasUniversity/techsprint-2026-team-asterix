import { Audio } from 'expo-av';
import * as ExpoFileSystem from 'expo-file-system/legacy';
import { useCallback, useRef, useState } from 'react';

// Audio Recording Constants
const SAMPLE_RATE = 44100; // Standard for Whisper
const CHUNK_DURATION_MS = 3000; // 3 seconds chunks (better for phrases)
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || ""; // Load from env

// Trigger Phrases (English & Hindi)
const TRIGGER_PHRASES = [
    "help", "help me", "save me", "stop", "no", "leave me",
    "don't touch me", "dont touch me", "don't hurt me", "dont hurt me",
    "let me go", "please stop", "somebody help", "call the police",
    "emergency", "i need help",
    "bachaao", "bachao", "meri madad karo", "mujhe bachaao", "mujhe bachao",
    "chhod do mujhe", "mat maaro", "mat chhoo", "jaane do",
    "police ko bulao", "madad chahiye", "ruk jaao", "ruk jao",
    "nahi nahi", "mere paas mat aao"
];

interface VoiceSOSOptions {
    onKeywordDetected: (info: {
        keyword: string;
        confidence: number;
        timestamp: number;
    }) => void;
    onAudioRecorded?: (uri: string) => void;
    onError?: (error: any) => void;
}

export default function useVoiceSOS(options: VoiceSOSOptions) {
    const { onKeywordDetected, onError } = options;
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const isProcessingRef = useRef(false);
    const shouldStopRef = useRef(false);
    const hasSpeechRef = useRef(false);

    // 🔄 Keep track of latest callback to avoid stale closures
    const onKeywordDetectedRef = useRef(onKeywordDetected);
    onKeywordDetectedRef.current = onKeywordDetected;

    // 1. Send to Cloud (Gemini 2.0 Flash)
    const sendAudioToCloud = async (uri: string) => {
        try {
            if (!GEMINI_API_KEY) {
                console.warn("[VoiceSOS] MISSING GEMINI API KEY! Cannot analyze.");
                return;
            }

            console.log('[VoiceSOS] Reading audio file for Gemini...');
            const base64Audio = await ExpoFileSystem.readAsStringAsync(uri, {
                encoding: 'base64',
            });

            console.log('[VoiceSOS] Sending audio to Gemini Flash Latest...');
            // console.log(`[VoiceSOS] DEBUG: API Key Present: ${!!GEMINI_API_KEY}, Length: ${GEMINI_API_KEY?.length}`);

            // Construct the payload for Gemini
            const payload = {
                contents: [
                    {
                        parts: [
                            {
                                text: "Listen to this audio carefully. It may contain emergency distress phrases in English or Hindi (Hinglish). \n\nYour task:\n1. Transcribe the audio.\n2. Detect if the user is saying any emergency phrase like 'Help', 'Bachao', 'Save me', 'Don't touch me', etc.\n\nReturn ONLY a valid JSON object in this format:\n{ \"transcription\": \"...\", \"emergency_detected\": true/false, \"keyword\": \"detected_keyword_or_null\" }"
                            },
                            {
                                inline_data: {
                                    mime_type: "audio/mp4", // expo-av .m4a uses audio/mp4 container usually, or audio/aac
                                    data: base64Audio
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    response_mime_type: "application/json"
                }
            };

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            const data = await response.json();

            // Check for API errors
            if (data.error) {
                console.error('[VoiceSOS] Gemini API Error:', data.error.message);
                return;
            }

            // Parse response
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                const responseText = data.candidates[0].content.parts[0].text;
                console.log('[VoiceSOS] Gemini Raw Response:', responseText);

                try {
                    const parsed = JSON.parse(responseText);
                    console.log(`[VoiceSOS] Transcription: "${parsed.transcription}" | Emergency: ${parsed.emergency_detected}`);

                    // Use Gemini's detection + fallback to local keyword check on transcription
                    if (parsed.emergency_detected) {
                        const keyword = parsed.keyword || "detected_intent";
                        console.log(`[VoiceSOS] 🚨 GEMINI TRIGGER DETECTED: "${keyword}"`);
                        onKeywordDetectedRef.current({
                            keyword: keyword,
                            confidence: 1.0,
                            timestamp: Date.now(),
                        });
                    } else {
                        // Fallback check just in case Gemini flaked on the flag but transcribed it correctly
                        checkTriggerPhrases(parsed.transcription);
                    }

                } catch (e) {
                    console.error('[VoiceSOS] Failed to parse JSON from Gemini:', e);
                    // Fallback to plain text check if possible (unlikely with json mode)
                }
            }

        } catch (error) {
            console.error('[VoiceSOS] Cloud API Error:', error);
        }
    };

    const checkTriggerPhrases = (text: string) => {
        if (!text) return;
        const lowerText = text.toLowerCase();

        // Check if any phrase is in the text
        const detected = TRIGGER_PHRASES.find(phrase => lowerText.includes(phrase));

        if (detected) {
            console.log(`[VoiceSOS] 🚨 FALLBACK TRIGGER DETECTED: "${detected}"`);
            // Call the REF instead of the prop directly
            onKeywordDetectedRef.current({
                keyword: detected,
                confidence: 0.9,
                timestamp: Date.now(),
            });
        }
    };

    // 3. Stop and Process
    const stopAndProcess = async (recording: Audio.Recording) => {
        try {
            if (isProcessingRef.current) return;
            // 🛑 VAD CHECK: Prevent Quota Exhaustion
            if (!hasSpeechRef.current) {
                console.log('[VoiceSOS] 🔇 No speech detected. Skipping API call to save quota.');

                // IMPORTANT: Unload previous recording before starting new one
                try {
                    await recording.stopAndUnloadAsync();
                } catch (e) { /* ignore already stopped */ }

                // Restart recording immediately
                if (!shouldStopRef.current) {
                    isProcessingRef.current = false;
                    setIsProcessing(false);
                    startListening();
                }
                return;
            }

            console.log('[VoiceSOS] Stopping recording...');
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();

            if (uri) {
                console.log('[VoiceSOS] Processing audio:', uri);
                await sendAudioToCloud(uri);
                // 🟢 Callback to parent for upload
                if (options.onAudioRecorded) {
                    options.onAudioRecorded(uri);
                }
            }

            // Restart loop if not stopped
            if (!shouldStopRef.current) {
                isProcessingRef.current = false;
                setIsProcessing(false);
                startListening();
            }

        } catch (error) {
            console.error('[VoiceSOS] Error processing:', error);
            // Restart anyway
            if (!shouldStopRef.current) {
                isProcessingRef.current = false;
                setIsProcessing(false);
                startListening();
            }
        }
    };

    // 4. Start Listening
    const startListening = useCallback(async () => {
        if (shouldStopRef.current) return;

        try {
            console.log('[VoiceSOS] Starting recording...');
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
            });

            const { recording } = await Audio.Recording.createAsync({
                android: {
                    extension: '.m4a',
                    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
                    audioEncoder: Audio.AndroidAudioEncoder.AAC,
                    sampleRate: SAMPLE_RATE,
                    numberOfChannels: 1,
                    bitRate: 128000,
                    // @ts-ignore
                    metering: true, // 👈 ENABLE METERING
                },
                ios: {
                    extension: '.m4a',
                    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
                    audioQuality: Audio.IOSAudioQuality.HIGH,
                    sampleRate: SAMPLE_RATE,
                    numberOfChannels: 1,
                    bitRate: 128000,
                    linearPCMBitDepth: 16,
                    linearPCMIsBigEndian: false,
                    linearPCMIsFloat: false,
                    // @ts-ignore
                    metering: true, // 👈 ENABLE METERING
                },
                web: {
                    mimeType: 'audio/webm',
                    bitsPerSecond: 128000,
                },
            });

            // 🔴 FIX: Check if stopped during initialization
            if (shouldStopRef.current) {
                console.log('[VoiceSOS] Stopped during initialization, unloading...');
                await recording.stopAndUnloadAsync();
                return;
            }

            recordingRef.current = recording;
            setIsListening(true);

            // 🎤 VAD SETUP: Monitor volume
            hasSpeechRef.current = false;
            let maxVol = -160;
            recording.setProgressUpdateInterval(200);
            recording.setOnRecordingStatusUpdate((status) => {
                if (status.metering !== undefined) {
                    if (status.metering > maxVol) maxVol = status.metering;
                    // Lower threshold to -75 (more sensitive)
                    if (status.metering > -75) {
                        hasSpeechRef.current = true;
                    }
                }
            });

            // Record for CHUNK_DURATION_MS then process
            setTimeout(async () => {
                console.log(`[VoiceSOS] Max Volume: ${maxVol.toFixed(1)} dB`); // Debug log

                // ⚠️ ROBUST MODE: If metering is -160 (stuck/broken) or very quiet, assume speech to be safe.
                if (maxVol <= -160) {
                    console.log('[VoiceSOS] ⚠️ Metering incomplete (Possible Device Issue). Force sending audio.');
                    hasSpeechRef.current = true;
                }

                if (shouldStopRef.current) {
                    // Just stop if we should stop
                    try {
                        if (recordingRef.current) {
                            const status = await recordingRef.current.getStatusAsync();
                            if (status.canRecord) {
                                await recordingRef.current.stopAndUnloadAsync();
                            }
                        }
                    } catch (e) { }
                    return;
                }
                await stopAndProcess(recording);
            }, CHUNK_DURATION_MS);

        } catch (error) {
            console.error('[VoiceSOS] Error starting recording:', error);
            setIsListening(false);
            onError?.(error);
        }
    }, []);

    // 5. Public Stop
    const stopListening = useCallback(async () => {
        shouldStopRef.current = true;
        setIsListening(false);
        if (recordingRef.current) {
            try {
                const status = await recordingRef.current.getStatusAsync();
                if (status.canRecord) {
                    await recordingRef.current.stopAndUnloadAsync();
                }
            } catch (e) {
                // Ignore
            }
            recordingRef.current = null;
        }
    }, []);

    // 6. Public Start
    const start = useCallback(() => {
        shouldStopRef.current = false;
        startListening();
    }, [startListening]);

    return {
        isListening,
        isProcessing,
        startListening: start,
        stopListening,
        isModelReady: true, // Mock for compatibility
    };
}
