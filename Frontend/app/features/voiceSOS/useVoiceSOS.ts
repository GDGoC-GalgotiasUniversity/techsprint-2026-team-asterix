import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useRef, useState } from 'react';

// Audio Recording Constants
const SAMPLE_RATE = 44100; // Standard for Whisper
const CHUNK_DURATION_MS = 3000; // 3 seconds chunks (safer for 15 RPM free tier)
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

const SAFE_PHRASES = [
    "i am safe", "im safe", "safe",
    "false alarm", "cancel", "stop sos", "don't send", "dont send",
    "main theek hoon", "galti se hua", "ruk jao", "sab theek hai"
];

interface VoiceSOSOptions {
    onKeywordDetected: (info: {
        keyword: string;
        type: 'trigger' | 'safe';
        confidence: number;
        timestamp: number;
    }) => void;
    onAudioRecorded?: (uri: string) => void;
    onError?: (error: any) => void;
    customSafeWords?: string[];
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

    // 🔄 Keep track of latest custom words
    const customSafeWordsRef = useRef(options.customSafeWords || []);
    customSafeWordsRef.current = options.customSafeWords || [];

    // 1. Send to Cloud (Gemini 2.0 Flash)
    const sendAudioToCloud = async (uri: string) => {
        try {
            if (!GEMINI_API_KEY) {
                console.warn("[VoiceSOS] MISSING API KEY! Cannot transcribe.");
                return;
            }

            console.log('[VoiceSOS] Reading audio file...');
            const base64Audio = await FileSystem.readAsStringAsync(uri, {
                encoding: 'base64',
            });

            const customWordsStr = customSafeWordsRef.current.join(", ");
            const systemPrompt = `You are a safety assistant. Listen to the audio and transcribe it EXACTLY.
            Focus on detecting emergency phrases like: 'Help', 'Bachao', 'Madad', 'Save me'.
            Also detect safe phrases like: 'I am safe', 'Cancel', '${customWordsStr}'.
            Return ONLY the transcription. If nothing is clear, return empty string.`;

            console.log('[VoiceSOS] Sending audio to Gemini...');
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: systemPrompt },
                            {
                                inline_data: {
                                    mime_type: "audio/mp4", // Mapping m4a to mp4 container for Gemini
                                    data: base64Audio
                                }
                            }
                        ]
                    }]
                }),
            });

            const data = await response.json();

            if (data.error) {
                console.error('[VoiceSOS] Gemini API Error:', data.error.message);
                return;
            }

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            console.log('[VoiceSOS] Transcription:', text);

            if (text) {
                checkTriggerPhrases(text);
            }

        } catch (error) {
            console.error('[VoiceSOS] Cloud API Error:', error);
        }
    };

    // ... (checkTriggerPhrases remains same) ...
    const checkTriggerPhrases = (text: string) => {
        if (!text) return;
        const lowerText = text.toLowerCase();

        // 1. Check for Safe Phrases FIRST
        // 1. Check for Safe Phrases FIRST
        const allSafePhrases = [...SAFE_PHRASES, ...customSafeWordsRef.current];

        console.log(`[VoiceSOS] Checking text: "${lowerText}" against safe words:`, allSafePhrases);

        // Use logic that checks if the lowerText INCLUDES any phrase
        const safeDetected = allSafePhrases.find(phrase => lowerText.includes(phrase.toLowerCase()));
        if (safeDetected) {
            console.log(`[VoiceSOS] 🛡 SAFE WORD DETECTED: "${safeDetected}"`);
            onKeywordDetectedRef.current({
                keyword: safeDetected,
                type: 'safe',
                confidence: 1.0,
                timestamp: Date.now(),
            });
            return; // Exit if safe word found
        }

        // 2. Check for Trigger Phrases
        const detected = TRIGGER_PHRASES.find(phrase => lowerText.includes(phrase));

        if (detected) {
            console.log(`[VoiceSOS] 🚨 TRIGGER DETECTED: "${detected}"`);
            // Call the REF instead of the prop directly
            onKeywordDetectedRef.current({
                keyword: detected,
                type: 'trigger',
                confidence: 1.0,
                timestamp: Date.now(),
            });
        }
    };

    // 3. Stop and Process
    const stopAndProcess = async (recording: Audio.Recording) => {
        try {
            if (isProcessingRef.current) return;
            isProcessingRef.current = true;
            setIsProcessing(true);

            // 🛑 VAD CHECK: Log but DO NOT BLOCK
            if (!hasSpeechRef.current) {
                console.log('[VoiceSOS] ⚠️ Low volume detected, but sending anyway (Robust Mode).');
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
                    // Lower threshold to -60 (more sensitive)
                    if (status.metering > -60) {
                        hasSpeechRef.current = true;
                    }
                }
            });

            // Record for CHUNK_DURATION_MS then process
            setTimeout(async () => {
                console.log(`[VoiceSOS] Max Volume: ${maxVol.toFixed(1)} dB`); // Debug log
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
