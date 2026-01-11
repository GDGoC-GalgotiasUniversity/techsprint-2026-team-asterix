import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Audio } from "expo-av";
import { CameraView } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { Accelerometer } from "expo-sensors";
import * as SMS from "expo-sms";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useVideoSOS } from "../features/videoSOS/useVideoSOS";
import useVoiceSOS from "../features/voiceSOS/useVoiceSOS";
const BASE_URL = "http://10.10.149.209:8080";
const API_URL = `${BASE_URL}/api/sos/trigger`;
const CONTACTS_URL = `${BASE_URL}/api/contacts`;
const UPDATE_URL = `${BASE_URL}/api/sos/update-location`;
// 🔊 Media upload backend
const MEDIA_UPLOAD_URL = `${BASE_URL}/api/media/upload`;

interface Contact {
  id: number;
  name: string;
  phoneNumber: string;
  primaryContact: boolean;
}

export default function HomeScreen() {
  const router = useRouter();
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [cooldown, setCooldown] = useState(false);
  const isAutoSendingRef = useRef(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [lastSOS, setLastSOS] = useState<{
    time: string | null;
    backendOk: boolean | null;
    smsOk: boolean | null;
  }>({
    time: null,
    backendOk: null,
    smsOk: null,
  });

  // 🔥 New states for tracking + recording
  const [tracking, setTracking] = useState(false);
  const [intervalId, setIntervalId] = useState<any>(null);
  const [sosId, setSosId] = useState<number | null>(null);
  const sosIdRef = useRef<number | null>(null); // 🟢 Ref to avoid stale state in callbacks
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null); // 🟢 Ref to avoid stale closure in timeout
  const recordingTimerRef = useRef<any>(null); // for 1-minute auto-stop

  // 🚨 Pre-SOS State
  const [preSosActive, setPreSosActive] = useState(false);
  const [countdown, setCountdown] = useState(8);
  const [customAlarmUri, setCustomAlarmUri] = useState<string | null>(null);
  const countdownTimerRef = useRef<any>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // 🛡 Custom Safe Words State
  const [customSafeWords, setCustomSafeWords] = useState<string[]>([]);
  const [isSafeWordModalVisible, setIsSafeWordModalVisible] = useState(false);
  const [newSafeWord, setNewSafeWord] = useState("");


  // 🟢 Ref for Pre-SOS state to use inside callbacks
  const preSosActiveRef = useRef(false);

  useEffect(() => {
    preSosActiveRef.current = preSosActive;
  }, [preSosActive]);

  // 📦 Media Uploads Ref for coordinating SMS
  const mediaUploadsRef = useRef<{
    audio?: string;
    video?: string;
    timer?: any; // Use any to avoid NodeJS vs Browser/RN type conflicts
    sent?: boolean;
  }>({});

  const THRESHOLD = 2.3; // lower = more sensitive, higher = less

  // 🗣 Voice SOS Hook
  const { startListening, stopListening, isListening, isModelReady } = useVoiceSOS({
    customSafeWords: customSafeWords, // 🟢 PASS CUSTOM WORDS
    onKeywordDetected: async (info: any) => {
      console.log("🗣 Voice SOS triggered:", info.keyword, "Type:", info.type);

      if (info.type === 'safe') {
        if (preSosActiveRef.current) {
          console.log("✅ Safe phrase detected! Cancelling SOS sequence.");
          await cancelAutomatedSequence();
        } else {
          console.log("ℹ Safe phrase detected but no SOS active. Ignoring.");
        }
      } else {
        // Trigger word detected
        if (preSosActiveRef.current || tracking) {
          console.log("ℹ SOS sequence already active. Ignoring trigger.");
        } else {
          // Start the Pre-SOS sequence (Countdown + Alarm)
          startAutomatedSequence();
        }
      }
    },
    onAudioRecorded: (uri: string) => {
      // This is for the continuous listening chunks (optional to upload)
      // For now, we only upload the main SOS recording.
      // If you want to upload the trigger phrase audio, do it here.
      // uploadAudio(uri);
    },
    onError: (err: any) => {
      console.log("🗣 Voice SOS Error:", err);
    }
  });

  // 📹 Video SOS Hook
  const {
    cameraRef,
    isRecording: isVideoRecording,
    startRecording: startVideoRecording,
    stopRecording: stopVideoRecording,
    permission: cameraPermission,
    requestPermission: requestCameraPermission
  } = useVideoSOS({
    onRecordingFinished: (uri) => {
      uploadVideo(uri);
    }
  });

  // Manage Voice Listener based on Tracking state and Screen Focus
  useFocusEffect(
    useCallback(() => {
      // Start listening only if focused AND not tracking
      if (!tracking) {
        startListening();
      }

      // Cleanup: Stop listening when unfocused or when tracking starts
      return () => {
        stopListening();
      };
    }, [tracking, startListening, stopListening])
  );

  const refreshContacts = async () => {
    try {
      const res = await axios.get(CONTACTS_URL);
      setContacts(res.data);
      console.log(
        "📇 Loaded contacts:",
        res.data.map((c: Contact) => c.phoneNumber)
      );
    } catch (err: any) {
      console.log("❌ Failed to load contacts:", err?.message || err);
    }
  };

  // 🔄 Keep track of latest handleMotion to avoid stale closures in listener
  const handleMotionRef = useRef((data: any) => { });

  useEffect(() => {
    handleMotionRef.current = handleMotion;
  });

  // 🎵 Load Custom Alarm on Mount
  useEffect(() => {
    (async () => {
      try {
        const storedUri = await AsyncStorage.getItem("custom_alarm_uri");
        if (storedUri) {
          const info = await FileSystem.getInfoAsync(storedUri);
          if (info.exists) {
            console.log("🎵 Loaded persistent custom alarm:", storedUri);
            setCustomAlarmUri(storedUri);
          } else {
            console.log("⚠️ Stored alarm URI invalid/missing, clearing:", storedUri);
            await AsyncStorage.removeItem("custom_alarm_uri");
          }
        }
      } catch (e) {
        console.log("❌ Failed to load custom alarm:", e);
      }
    })();
  }, []);

  const handleMotion = (motionData: { x: number; y: number; z: number }) => {
    const { x, y, z } = motionData;
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    if (magnitude > THRESHOLD && !cooldown && !tracking && !preSosActive) {
      console.log("🚨 Sudden motion detected:", magnitude);
      startAutomatedSequence();
    }
  };

  useEffect(() => {
    console.log("📡 Starting accelerometer listener...");
    Accelerometer.setUpdateInterval(200);

    const subscription = Accelerometer.addListener((accelerometerData) => {
      setData(accelerometerData);
      // Call the REF to get the latest state (contacts, tracking, etc.)
      handleMotionRef.current(accelerometerData);
    });

    // load contacts from backend
    refreshContacts();

    return () => {
      console.log("📡 Stopping accelerometer listener...");
      subscription && subscription.remove();

      // stop tracking & clear interval if any
      if (intervalId) {
        clearInterval(intervalId);
      }

      // clear recording timer if any
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
      }
    };
  }, [intervalId]);

  // 🛡 Load Safe Words on Mount
  useEffect(() => {
    (async () => {
      try {
        const storedWords = await AsyncStorage.getItem("custom_safe_words");
        if (storedWords) {
          setCustomSafeWords(JSON.parse(storedWords));
        }
      } catch (e) {
        console.log("❌ Failed to load safe words:", e);
      }
    })();
  }, []);

  // 🛡 Save Safe Words Helper
  const saveSafeWords = async (updatedWords: string[]) => {
    try {
      await AsyncStorage.setItem("custom_safe_words", JSON.stringify(updatedWords));
      setCustomSafeWords(updatedWords);
    } catch (e) {
      console.log("❌ Failed to save safe words:", e);
    }
  };

  const addSafeWord = () => {
    if (!newSafeWord.trim()) return;
    if (customSafeWords.includes(newSafeWord.trim())) {
      Alert.alert("Duplicate", "This word is already added.");
      return;
    }
    const updated = [...customSafeWords, newSafeWord.trim()];
    saveSafeWords(updated);
    setNewSafeWord("");
  };

  const deleteSafeWord = (word: string) => {
    const updated = customSafeWords.filter(w => w !== word);
    saveSafeWords(updated);
  };

  // 📩 SMS (now can include optional audio URL)
  const sendSMSWithLocation = async (
    latitude?: number,
    longitude?: number,
    audioUrl?: string
  ) => {
    console.log("📩 Checking SMS availability...");
    const isAvailable = await SMS.isAvailableAsync();
    console.log("📩 SMS available:", isAvailable);

    let mapsPart = "";
    if (latitude != null && longitude != null) {
      const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
      mapsPart = `\nMy Location:\n${mapsLink}`;
    }

    const audioPart = audioUrl ? `\nAudio Evidence:\n${audioUrl}` : "";

    const message = `🚨 EMERGENCY! I need help.${mapsPart}${audioPart}`;

    const recipients =
      contacts.length > 0
        ? contacts.map((c) => c.phoneNumber)
        : ["+917906272840"]; // fallback to your number

    console.log("📇 Using recipients:", recipients);

    if (!isAvailable) {
      Alert.alert("SMS unavailable", "Cannot open SMS app on this device.");
      return false;
    }

    try {
      const result = await SMS.sendSMSAsync(recipients, message);
      console.log("📩 SMS result:", result);
      return true;
    } catch (e: any) {
      console.log("📩 SMS error:", e?.message || e);
      Alert.alert("SMS Error", "Could not open SMS app.");
      return false;
    }
  };

  // 🎙 Start audio recording (for SOS evidence)
  const startRecording = async () => {
    try {
      console.log("🎙 Requesting microphone permission...");
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Microphone access is needed.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      let recordingObject = null;
      for (let i = 0; i < 3; i++) {
        try {
          const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          recordingObject = recording;
          break;
        } catch (e) {
          console.log(`🎙 Attempt ${i + 1} failed to start recording, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms
        }
      }

      if (!recordingObject) {
        throw new Error("Failed to start recording after 3 attempts");
      }

      setRecording(recordingObject);
      recordingRef.current = recordingObject; // 🟢 Sync Ref
      console.log("🎙 Recording started");
      Alert.alert("Recording Started", "Audio is being recorded for safety.");
    } catch (err) {
      console.log("🎙 Recording error:", err);
    }
  };

  const checkAndSendSMS = async () => {
    const { audio, video, sent } = mediaUploadsRef.current;

    // If already sent, stop
    if (sent) return;

    // If both are ready, send immediately
    if (audio && video) {
      if (mediaUploadsRef.current.timer) {
        clearTimeout(mediaUploadsRef.current.timer);
      }
      await sendConsolidatedSMS(audio, video);
      mediaUploadsRef.current.sent = true;
      return;
    }

    // If only one is ready, wait a bit for the other
    if (!mediaUploadsRef.current.timer) {
      console.log("⏳ Waiting for second media before sending SMS...");
      mediaUploadsRef.current.timer = setTimeout(async () => {
        const { audio: finalAudio, video: finalVideo, sent: finalSent } = mediaUploadsRef.current;
        if (!finalSent) {
          console.log("⏰ Timeout reached, sending available media SMS.");
          await sendConsolidatedSMS(finalAudio, finalVideo);
          mediaUploadsRef.current.sent = true;
        }
      }, 5000); // Wait 5 seconds max
    }
  };

  const sendConsolidatedSMS = async (audioUrl?: string, videoUrl?: string) => {
    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) return;

    let message = `🚨 EMERGENCY EVIDENCE:\n`;
    if (audioUrl) message += `🎤 Audio: ${audioUrl}\n`;
    if (videoUrl) message += `📹 Video: ${videoUrl}\n`;

    // Fallback if nothing (shouldn't happen logic-wise but good for safety)
    if (!audioUrl && !videoUrl) message += "Media upload failed or timed out.";

    const recipients = contacts.length > 0 ? contacts.map((c) => c.phoneNumber) : ["+917906272840"];

    try {
      console.log("📲 Sending Consolidated SMS...");
      await SMS.sendSMSAsync(recipients, message);
    } catch (e) {
      console.log("❌ SMS Error:", e);
    }
  };

  // 📤 Upload Audio Evidence
  const uploadAudio = async (uri: string) => {
    const currentSosId = sosIdRef.current; // 🟢 Use Ref
    if (!currentSosId) {
      console.log("⚠️ No active SOS ID for audio upload.");
      return;
    }

    try {
      console.log("📤 Uploading audio...", uri);
      const formData = new FormData();
      // @ts-ignore
      formData.append("file", {
        uri,
        name: `sos_audio_${Date.now()}.m4a`,
        type: "audio/m4a",
      });

      const uploadRes = await axios.post(`${BASE_URL}/api/media/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const audioUrl = uploadRes.data.url;
      console.log("✅ Audio uploaded:", audioUrl);

      // Update SOS with audio URL
      await axios.post(UPDATE_URL, {
        id: currentSosId,
        audioUrl: audioUrl,
        timestamp: new Date().toISOString(),
      });

      // 🟢 Update Ref and Check SMS
      mediaUploadsRef.current.audio = audioUrl;
      checkAndSendSMS();

    } catch (err: any) {
      console.log("❌ Audio upload failed:", err?.message || err);
    }
  };

  // 📹 Upload Video
  const uploadVideo = async (uri: string) => {
    const currentSosId = sosIdRef.current; // 🟢 Use Ref
    if (!currentSosId) {
      console.log("⚠️ No active SOS ID for video upload.");
      return;
    }

    try {
      console.log("📤 Uploading video...", uri);
      const formData = new FormData();
      // @ts-ignore
      formData.append("file", {
        uri,
        name: `sos_video_${Date.now()}.mp4`,
        type: "video/mp4",
      });

      const uploadRes = await axios.post(`${BASE_URL}/api/media/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const videoUrl = uploadRes.data.url;
      console.log("✅ Video uploaded:", videoUrl);

      // Update SOS with video URL
      await axios.post(UPDATE_URL, {
        id: currentSosId,
        mediaUrl: videoUrl,
        timestamp: new Date().toISOString(),
      });

      // 🟢 Update Ref and Check SMS
      mediaUploadsRef.current.video = videoUrl;
      checkAndSendSMS();

      Alert.alert("Evidence Uploaded", "Video has been securely uploaded.");
    } catch (err: any) {
      console.log("❌ Video upload failed:", err?.message || err);
      Alert.alert("Upload Failed", "Could not upload video evidence.");
    }
  };

  // 🛰 Send updated location every 5 seconds to backend
  const sendLocationUpdate = async () => {
    if (!tracking || !sosId) return;

    try {
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;

      await axios.post(UPDATE_URL, {
        id: sosId,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        contactNumber: "+911234567890", // not used but for entity compatibility
      });

      console.log("📍 Continuous location update sent:", latitude, longitude);
    } catch (err: any) {
      console.log("❌ Failed to send update location:", err?.message || err);
    }
  };

  // 🎙 Stop audio recording
  const stopRecording = async () => {
    try {
      const rec = recordingRef.current; // 🟢 Use Ref
      if (!rec) return;
      console.log("🎙 Stopping recording...");
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      console.log("📁 Audio file saved at:", uri);
      setRecording(null);
      recordingRef.current = null; // 🟢 Clear Ref

      if (uri) {
        uploadAudio(uri); // 🟢 Upload immediately
      }

      Alert.alert("Recording Saved", "Audio evidence stored locally.");
    } catch (err) {
      console.log("🎙 Stop recording error:", err);
    }
  };

  // 🚀 Start tracking (interval + audio)
  const startTracking = async (alertId: number) => {
    console.log("🔁 Starting SOS tracking for id:", alertId);

    // 🛑 STOP Voice Listener explicitly to release mic
    await stopListening();

    setTracking(true);
    setSosId(alertId);
    sosIdRef.current = alertId; // 🟢 Sync Ref

    // 🔄 Reset Media Uploads Ref
    mediaUploadsRef.current = {
      audio: undefined,
      video: undefined,
      timer: undefined,
      sent: false,
    };

    // Start audio recording
    await startRecording();
    // Start video recording
    if (cameraPermission?.granted) {
      startVideoRecording();
    } else {
      requestCameraPermission();
    }

    // Auto stop recording after 1 minute
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
    }
    recordingTimerRef.current = setTimeout(async () => {
      if (isAutoSendingRef.current) return;   // 🔒 prevent duplicate sends
      isAutoSendingRef.current = true;

      console.log("⏰ Auto-stopping recording after 30 seconds");

      await stopRecording();   // 🔥 IMPORTANT: now SMS + upload completes

      isAutoSendingRef.current = false;
    }, 30000);


    // Start interval for continuous location updates
    const id = setInterval(() => {
      sendLocationUpdate();
    }, 5000); // 5 seconds

    setIntervalId(id);

    // 🛑 Safety Timeout: Stop tracking/recording after 20s (buffer for 15s video)
    // This ensures we don't record indefinitely if camera doesn't stop
    setTimeout(() => {
      console.log("⏰ Safety timeout reached. Stopping SOS tracking...");
      stopTracking();
    }, 20000);
  };

  // 🛑 Stop tracking (interval + audio)
  const stopTracking = async () => {
    console.log("🛑 Stopping SOS tracking...");

    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }

    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // Stop recording immediately, upload & send audio link
    await stopRecording();
    stopVideoRecording();

    // Delay clearing ID slightly to allow uploads to read it
    setTimeout(() => {
      setSosId(null);
      sosIdRef.current = null;
    }, 5000);

    setTracking(false);

    Alert.alert("SOS Stopped", "Tracking and recording have been stopped.");
  };

  const triggerAutoSOS = async () => {
    if (tracking) {
      Alert.alert(
        "SOS already active",
        "Stop current SOS before starting a new one."
      );
      return;
    }

    // 🛑 FORCE CLEANUP of any Pre-SOS state (Manual Override)
    if (preSosActiveRef.current || countdownTimerRef.current) {
      console.log("🛑 Manual SOS pressed: Cancelling active Pre-SOS sequence...");
      setPreSosActive(false);
      setCountdown(8);
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) { }
        soundRef.current = null;
      }
    }

    setCooldown(true);
    setTimeout(() => setCooldown(false), 5000); // 5s cooldown

    console.log("⚙ Auto SOS started…");

    let latitude: number | null = null;
    let longitude: number | null = null;
    let backendOk = false;
    let smsOk = false;
    let createdSosId: number | null = null;

    try {
      // 1️⃣ LOCATION
      let { status } = await Location.requestForegroundPermissionsAsync();
      console.log("📍 Location permission status:", status);

      if (status !== "granted") {
        Alert.alert("Permission denied", "Location is required.");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      latitude = loc.coords.latitude;
      longitude = loc.coords.longitude;
      console.log("📍 Got location:", latitude, longitude);

      // 2️⃣ BACKEND
      try {
        const response = await axios.post(API_URL, {
          latitude,
          longitude,
          contactNumber: "+911234567890",
          timestamp: new Date().toISOString(),
        });
        console.log("✅ Auto SOS sent to backend:", response.data);
        backendOk = true;
        createdSosId = response.data.id;
      } catch (err: any) {
        console.log("❌ Backend error:", err?.message || err);
      }

      // 3️⃣ Immediate SMS (location only)
      if (latitude !== null && longitude !== null) {
        smsOk = await sendSMSWithLocation(latitude, longitude);
      }

      // 4️⃣ Save status for UI
      setLastSOS({
        time: new Date().toLocaleTimeString(),
        backendOk,
        smsOk,
      });

      // 5️⃣ Start continuous tracking + audio recording only if backend succeeded
      if (backendOk && createdSosId !== null) {
        await startTracking(createdSosId);
      }

      // 6️⃣ Final combined alert
      let statusMsg = "";
      statusMsg += backendOk ? "Backend: OK" : "Backend: FAILED";
      statusMsg += "\n";
      statusMsg += smsOk ? "SMS: OK" : "SMS: FAILED";

      Alert.alert("SOS Status", statusMsg);
    } catch (error: any) {
      console.log("❌ Auto SOS Error (outer):", error?.message || error);
      Alert.alert("Error", "Failed to send SOS (unexpected error)");
    }
  };

  // 🎵 Pick Custom Alarm
  const pickCustomAlarm = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        console.log("🎵 Alarm selection cancelled");
        return;
      }

      const originalUri = result.assets[0].uri;
      console.log("🎵 Selected audio:", originalUri);


      // 📂 Copy to persistent storage
      const fileName = "custom_alarm.mp3";
      // Use documentDirectory from legacy package
      const newUri = FileSystem.documentDirectory + fileName;

      await FileSystem.copyAsync({
        from: originalUri,
        to: newUri,
      });

      console.log("📂 Validated & Saved to:", newUri);

      setCustomAlarmUri(newUri);
      await AsyncStorage.setItem("custom_alarm_uri", newUri);
      Alert.alert("Success", "Custom alarm tone set successfully.");

    } catch (err) {
      console.log("❌ Error picking/saving document:", err);
      Alert.alert("Error", "Failed to save audio file.");
    }
  };

  // 🚨 Start Automated Sequence (Countdown + Alarm)
  const startAutomatedSequence = async () => {
    if (preSosActive || tracking) return;

    console.log("⏳ Starting Automated SOS Sequence...");
    setPreSosActive(true);
    setCountdown(8);

    // Play Alarm Sound
    try {
      // Ensure audio plays even in silent mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      let soundSource = null;

      if (customAlarmUri) {
        // Verify file exists
        const info = await FileSystem.getInfoAsync(customAlarmUri);
        if (info.exists) {
          console.log("🎵 Playing custom alarm:", customAlarmUri);
          soundSource = { uri: customAlarmUri };
        } else {
          console.log("⚠️ Custom alarm file missing:", customAlarmUri);
        }
      }

      // If no custom or missing, try default (if it exists in bundle)
      if (!soundSource) {
        try {
          // WRAP require in try/catch isn't enough for bundling if file is missing at build time
          // But since user says it's missing, we skip if we can't reliably load it.
          // For now, we attempt to load it only if we can't use custom.
          // Note: If 'assets/alarm.mp3' is truly missing from disk, the bundler might warn/error.
          // We will try to rely on custom alarm mainly.
          soundSource = require('../../assets/alarm.mp3');
        } catch (e) {
          console.log("⚠️ Default alarm asset missing.");
        }
      }

      if (soundSource) {
        const { sound } = await Audio.Sound.createAsync(soundSource);
        soundRef.current = sound;
        await sound.setIsLoopingAsync(true);
        await sound.playAsync();
      } else {
        Alert.alert("Alarm Missing", "No alarm sound available to play.");
      }

    } catch (e) {
      console.log("🔊 Failed to play alarm sound:", e);
      Alert.alert("Error", "Could not play alarm sound.");
    }

    // Start Countdown
    let timeLeft = 8;
    countdownTimerRef.current = setInterval(() => {
      timeLeft -= 1;
      setCountdown(timeLeft);

      if (timeLeft <= 0) {
        // Timeout reached -> Trigger generic SOS
        clearInterval(countdownTimerRef.current);
        finishAutomatedSequence();
      }
    }, 1000);
  };

  // 🛑 Cancel Automated Sequence
  const cancelAutomatedSequence = async () => {
    console.log("🛡 SOS Sequence Cancelled by User.");

    // Stop Timer
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    // Stop Sound
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {
        console.log("🔊 Error stopping sound:", e);
      }
      soundRef.current = null;
    }

    setPreSosActive(false);
    setCountdown(8);
    Alert.alert("Cancelled", "Emergency SOS cancelled. You are safe.");
  };

  // 🚀 Finish Sequence -> Actually Trigger SOS
  const finishAutomatedSequence = async () => {
    console.log("🚨 Countdown finished. Triggering REAL SOS!");

    // Stop Sound
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) { }
      soundRef.current = null;
    }

    setPreSosActive(false);

    // Stop Voice Listening (to free up mic for SOS recording)
    stopListening();

    // Trigger the actual SOS logic
    triggerAutoSOS();
  };

  const magnitude = Math.sqrt(
    data.x * data.x + data.y * data.y + data.z * data.z
  ).toFixed(2);

  const renderStatusBadge = (label: string, value: boolean | null) => {
    let text = "PENDING";
    let style = styles.badgePending;

    if (value === true) {
      text = "OK";
      style = styles.badgeOk;
    } else if (value === false) {
      text = "FAILED";
      style = styles.badgeFailed;
    }

    return (
      <View style={styles.badgeRow}>
        <Text style={styles.badgeLabel}>{label}</Text>
        <View style={[styles.badge, style]}>
          <Text style={styles.badgeText}>{text}</Text>
        </View>
      </View>
    );
  }; const handleAddContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      Alert.alert("Missing info", "Please enter both name and phone number.");
      return;
    }

    try {
      await axios.post(CONTACTS_URL, {
        name: contactName.trim(),
        phoneNumber: contactPhone.trim(),
        primaryContact: false,
      });
      setContactName("");
      setContactPhone("");
      await refreshContacts();
      Alert.alert("Added", "Emergency contact added successfully.");
    } catch (err: any) {
      console.log("❌ Failed to add contact:", err?.message || err);
      Alert.alert("Error", "Failed to add contact.");
    }
  };

  const handleDeleteContact = async (id: number) => {
    Alert.alert(
      "Delete contact?",
      "Are you sure you want to remove this emergency contact?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              console.log("🗑 Deleting contact with id:", id);
              const url = `${CONTACTS_URL}/${id}`;
              console.log("🗑 DELETE URL:", url);
              const res = await axios.delete(url);
              console.log("🗑 Delete response status:", res.status);
              await refreshContacts();
            } catch (err: any) {
              console.log("❌ Failed to delete contact:", err?.message || err);
              Alert.alert("Error", "Failed to delete contact.");
            }
          },
        },
      ]
    );
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem("token");
      router.replace("/login");
    } catch (error) {
      console.log("❌ Logout error:", error);
    }
  };

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.appTitle}>Aarambh</Text>
          <Text style={styles.appSubtitle}>
            Smart emergency detection with motion, voice, and live location tracking
          </Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Motion Detection Card */}
        <View style={[styles.card, styles.motionCard]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconText}>📡</Text>
            </View>
            <View>
              <Text style={styles.cardTitle}>Motion Detection</Text>
              <Text style={styles.cardSubtitle}>Live accelerometer monitoring</Text>
            </View>
          </View>

          <View style={styles.motionContent}>
            <View style={styles.magnitudeContainer}>
              <Text style={styles.motionValue}>{magnitude}</Text>
              <Text style={styles.motionUnit}>g-force</Text>
            </View>

            <View style={styles.thresholdContainer}>
              <Text style={styles.thresholdLabel}>Threshold: {THRESHOLD.toFixed(1)} g</Text>
              <View style={styles.thresholdBar}>
                <View
                  style={[
                    styles.thresholdFill,
                    {
                      width: `${(Math.min(parseFloat(magnitude), THRESHOLD * 1.5) / (THRESHOLD * 1.5)) * 100}%`,
                      backgroundColor: parseFloat(magnitude) > THRESHOLD ? '#ef4444' : '#22c55e'
                    }
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.statusContainer}>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, cooldown ? styles.statusDotWarning : styles.statusDotSuccess]} />
              <Text style={styles.statusText}>
                {cooldown ? "Cooldown Active" : "Monitoring"}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, tracking ? styles.statusDotActive : styles.statusDotInactive]} />
              <Text style={styles.statusText}>
                {tracking ? "Tracking Active" : "Tracking Ready"}
              </Text>
            </View>
          </View>
        </View>

        {/* Last SOS Status */}
        <View style={[styles.card, styles.statusCard]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconText}>🚨</Text>
            </View>
            <View>
              <Text style={styles.cardTitle}>Last SOS Status</Text>
              <Text style={styles.cardSubtitle}>
                {lastSOS.time ? `Triggered at ${lastSOS.time}` : "No SOS events yet"}
              </Text>
            </View>
          </View>

          <View style={styles.statusBadges}>
            {renderStatusBadge("Backend Service", lastSOS.backendOk)}
            {renderStatusBadge("SMS Notifications", lastSOS.smsOk)}
          </View>
        </View>

        {/* Emergency Contacts */}
        <View style={[styles.card, styles.contactsCard]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconText}>📞</Text>
            </View>
            <View>
              <Text style={styles.cardTitle}>Emergency Contacts</Text>
              <Text style={styles.cardSubtitle}>
                {contacts.length} contact{contacts.length !== 1 ? 's' : ''} configured
              </Text>
            </View>
          </View>

          {/* Contacts List */}
          {contacts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>👥</Text>
              <Text style={styles.emptyStateTitle}>No Contacts</Text>
              <Text style={styles.emptyStateText}>
                Add emergency contacts to receive SOS alerts
              </Text>
            </View>
          ) : (
            <View style={styles.contactsList}>
              {contacts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.contactItem}
                  onPress={() => handleDeleteContact(c.id)}
                >
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactAvatarText}>
                      {c.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{c.name}</Text>
                    <Text style={styles.contactPhone}>{c.phoneNumber}</Text>
                  </View>
                  <View style={styles.contactAction}>
                    <Text style={styles.deleteText}>Remove</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Add Contact Form */}
          <View style={styles.addContactForm}>
            <Text style={styles.formTitle}>Add New Contact</Text>
            <View style={styles.formRow}>
              <TextInput
                style={[styles.input, styles.flex1]}
                placeholder="Full Name"
                placeholderTextColor="#94a3b8"
                value={contactName}
                onChangeText={setContactName}
              />
              <TextInput
                style={[styles.input, styles.flex1]}
                placeholder="Phone Number"
                placeholderTextColor="#94a3b8"
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddContact}
            >
              <Text style={styles.addButtonText}>Add Contact</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SOS Button Section */}
        <View style={styles.sosSection}>
          <View style={styles.sosContainer}>
            <TouchableOpacity
              style={[
                styles.sosButton,
                tracking && styles.sosButtonActive
              ]}
              onPress={tracking ? stopTracking : triggerAutoSOS}
              activeOpacity={0.8}
            >
              <View style={styles.sosButtonInner}>
                <Text style={styles.sosIcon}>
                  {tracking ? "🛑" : "🚨"}
                </Text>
                <Text style={styles.sosText}>
                  {tracking ? "STOP SOS" : "EMERGENCY SOS"}
                </Text>
                <Text style={styles.sosSubtext}>
                  {tracking ? "Tap to stop emergency" : "Tap or shake to trigger"}
                </Text>
              </View>

              {/* Pulsing animation when tracking */}
              {tracking && <View style={styles.pulseRing} />}
              {tracking && <View style={[styles.pulseRing, styles.pulseRing2]} />}
            </TouchableOpacity>

            <Text style={styles.sosHint}>
              {tracking
                ? "Emergency active - Location tracking and audio recording enabled"
                : "System ready - Motion and voice detection active"}
            </Text>
          </View>

          {/* Voice Test Link */}
          <View style={styles.settingsRow}>
            <TouchableOpacity
              style={[styles.testButton, { flex: 1, marginRight: 8 }]}
              onPress={() => router.push("/voice-test")}
            >
              <Text style={styles.testButtonText}>Test Voice SOS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testButton, { backgroundColor: '#475569' }]}
              onPress={pickCustomAlarm}
            >
              <Text style={styles.testButtonText}>
                {customAlarmUri ? "🎵 Change Tone" : "🎵 Set Alarm Tone"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 🛡 Safe Words Button */}
          <TouchableOpacity
            style={styles.safeWordsButton}
            onPress={() => setIsSafeWordModalVisible(true)}
          >
            <Text style={styles.safeWordsIcon}>🛡</Text>
            <Text style={styles.safeWordsText}>Manage Safe Words</Text>
          </TouchableOpacity>
        </View>

        {/* Logout Section */}
        <View style={styles.logoutSection}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={logout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🚨 Pre-SOS Overlay Modal */}
      {preSosActive && (
        <View style={styles.preSosOverlay}>
          <View style={styles.preSosBox}>
            <Text style={styles.preSosTitle}>🚨 EMERGENCY ALERT 🚨</Text>
            <Text style={styles.preSosText}>SOS will be sent in</Text>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.preSosSubText}>
              Say <Text style={styles.boldText}>"I AM SAFE"</Text> or tap Cancel
            </Text>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelAutomatedSequence}
            >
              <Text style={styles.cancelButtonText}>CANCEL SOS</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 🛡 Safe Words Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSafeWordModalVisible}
        onRequestClose={() => setIsSafeWordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Manage Safe Words</Text>
            <Text style={styles.modalSubtitle}>Say these words to cancel an SOS.</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter word (e.g. 'False Alarm')"
                placeholderTextColor="#64748b"
                value={newSafeWord}
                onChangeText={setNewSafeWord}
              />
              <TouchableOpacity style={styles.modalAddButton} onPress={addSafeWord}>
                <Text style={styles.modalAddButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={customSafeWords}
              keyExtractor={(item) => item}
              style={styles.modalList}
              renderItem={({ item }) => (
                <View style={styles.modalListItem}>
                  <Text style={styles.modalListItemText}>{item}</Text>
                  <TouchableOpacity onPress={() => deleteSafeWord(item)}>
                    <Text style={styles.modalDeleteIcon}>🗑</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.modalEmptyText}>No custom words added yet.</Text>}
            />

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setIsSafeWordModalVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {/* Hidden Camera View for Background Recording */}
      <View style={{ height: 1, width: 1, overflow: 'hidden', opacity: 0 }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          mode="video"
          facing="back"
          mute={false}
        />
      </View>
    </ScrollView >
  );

}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    alignItems: 'center',
  },
  appTitle: {
    color: "white",
    fontSize: 28,
    fontWeight: "800",
    textAlign: 'center',
    marginBottom: 8,
  },
  appSubtitle: {
    color: "#cbd5e1",
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  motionCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
  },
  statusCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  contactsCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#10b981",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardIconText: {
    fontSize: 18,
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  motionContent: {
    alignItems: 'center',
    marginVertical: 16,
  },
  magnitudeContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  motionValue: {
    color: "#f97316",
    fontSize: 42,
    fontWeight: "800",
    textShadowColor: 'rgba(249, 115, 22, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  motionUnit: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
    marginTop: -4,
  },
  thresholdContainer: {
    width: '100%',
  },
  thresholdLabel: {
    color: "#cbd5e1",
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  thresholdBar: {
    height: 6,
    backgroundColor: "#334155",
    borderRadius: 3,
    overflow: 'hidden',
    padding: 0,
  },
  thresholdFill: {
    height: '100%',
    borderRadius: 3,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotSuccess: {
    backgroundColor: '#22c55e',
  },
  statusDotWarning: {
    backgroundColor: '#f59e0b',
  },
  statusDotActive: {
    backgroundColor: '#ef4444',
  },
  statusDotInactive: {
    backgroundColor: '#6b7280',
  },
  statusText: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadges: {
    marginTop: 8,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  badgeLabel: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "500",
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  badgeOk: {
    backgroundColor: "#16a34a",
  },
  badgeFailed: {
    backgroundColor: "#dc2626",
  },
  badgePending: {
    backgroundColor: "#6b7280",
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyStateText: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: 'center',
  },
  contactsList: {
    marginBottom: 20,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contactAvatarText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "600",
  },
  contactPhone: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 2,
  },
  contactAction: {},
  deleteText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: '600',
  },
  addContactForm: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  formTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "white",
    fontSize: 14,
  },
  flex1: {
    flex: 1,
  },
  addButton: {
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
  sosSection: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  sosContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  sosButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 16,
  },
  sosButtonActive: {
    backgroundColor: "#dc2626",
  },
  sosButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  sosIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  sosText: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  sosSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: '#ef4444',
    opacity: 0.6,
  },
  pulseRing2: {
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.3,
  },
  sosHint: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 280,
  },
  testButton: {
    backgroundColor: "#334155",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#475569",
    alignItems: 'center',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  testButtonText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: '600',
  },
  logoutSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoutButton: {
    backgroundColor: "#1e293b",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  logoutButtonText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
  },
  safeWordsButton: {
    backgroundColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  safeWordsIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  safeWordsText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 20,
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  modalInput: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 12,
    color: "white",
    borderWidth: 1,
    borderColor: "#334155",
    marginRight: 10,
  },
  modalAddButton: {
    backgroundColor: "#f97316",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  modalAddButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  modalList: {
    marginBottom: 20,
  },
  modalListItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  modalListItemText: {
    color: "white",
    fontSize: 16,
  },
  modalDeleteIcon: {
    color: "#ef4444",
    fontSize: 18,
  },
  modalEmptyText: {
    color: "#64748b",
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 20,
  },
  modalCloseButton: {
    backgroundColor: "#334155",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCloseButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  preSosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  preSosBox: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  preSosTitle: {
    color: '#ef4444',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 16,
    letterSpacing: 1,
  },
  preSosText: {
    color: '#cbd5e1',
    fontSize: 16,
    marginBottom: 8,
  },
  countdownText: {
    color: 'white',
    fontSize: 80,
    fontWeight: '900',
    marginVertical: 8,
  },
  preSosSubText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  boldText: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginTop: 32,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
