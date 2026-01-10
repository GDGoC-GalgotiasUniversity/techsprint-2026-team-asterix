import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { CameraView } from "expo-camera";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { Accelerometer } from "expo-sensors";
import * as SMS from "expo-sms";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  Platform,
} from "react-native";
import { useVideoSOS } from "../../features/videoSOS/useVideoSOS";
import useVoiceSOS from "../../features/voiceSOS/useVoiceSOS";

const { width } = Dimensions.get("window");
const BASE_URL = "http://10.10.150.219:8080";
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

  // 📦 Media Uploads Ref for coordinating SMS
  const mediaUploadsRef = useRef<{
    audio?: string;
    video?: string;
    timer?: any; // Use any to avoid NodeJS vs Browser/RN type conflicts
    sent?: boolean;
  }>({});

  // 🟢 Load contacts on mount
  useEffect(() => {
    refreshContacts();
  }, []);

  // 🗣 Voice SOS Hook
  const { startListening, stopListening, isListening, isModelReady } = useVoiceSOS({
    onKeywordDetected: async (info: any) => {
      console.log("🗣 Voice SOS triggered:", info.keyword);
      // Stop listening immediately to release mic for SOS recording
      await stopListening();
      // Trigger Auto SOS
      triggerAutoSOS();
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

  // � Voice SOS Hook
  // 🟢 Accelerometer Logic Moved to MotionMonitor Component 🟢

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
    <View style={styles.container}>
      <LinearGradient
        colors={["#0f172a", "#1e1b4b", "#000000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />
      <ScrollView style={styles.screen} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.appTitle}>AGEIS</Text>
            <Text style={styles.appSubtitle}>
              Intelligent Protection System
            </Text>
          </View>
        </View>

        {/* SOS Button Section - Centerpiece */}
        <View style={styles.sosSection}>
          <View style={styles.sosContainer}>
            {tracking && (
              <>
                <View style={[styles.pulseRing, styles.pulseRing1]} />
                <View style={[styles.pulseRing, styles.pulseRing2]} />
                <View style={[styles.pulseRing, styles.pulseRing3]} />
              </>
            )}
            <TouchableOpacity
              style={styles.sosButtonCore}
              onPress={tracking ? stopTracking : triggerAutoSOS}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={tracking ? ["#7f1d1d", "#ef4444"] : ["#ef4444", "#dc2626"]}
                style={[styles.sosButtonGradient, tracking && styles.sosButtonActive]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.sosIcon}>
                  {tracking ? "🛑" : "🚨"}
                </Text>
                <Text style={styles.sosText}>
                  {tracking ? "STOP" : "SOS"}
                </Text>
                <Text style={styles.sosSubtext}>
                  {tracking ? "TRACKING ACTIVE" : "TAP TO ACTIVATE"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.cardsContainer}>
          {/* Motion Detection Card (Isolated) */}
          <MotionMonitor
            tracking={tracking}
            cooldown={cooldown}
            onTrigger={triggerAutoSOS}
          />

          {/* Status Card */}
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(30, 41, 59, 0.7)", "rgba(15, 23, 42, 0.4)"]}
              style={styles.cardGradient}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(234, 179, 8, 0.2)' }]}>
                  <Text style={styles.cardIconText}>🛡️</Text>
                </View>
                <View>
                  <Text style={styles.cardTitle}>System Status</Text>
                  <Text style={styles.cardSubtitle}>
                    {lastSOS.time ? `Last Alert: ${lastSOS.time}` : "System Ready"}
                  </Text>
                </View>
              </View>

              <View style={styles.statusBadges}>
                {renderStatusBadge("Backend", lastSOS.backendOk)}
                {renderStatusBadge("SMS", lastSOS.smsOk)}
              </View>
            </LinearGradient>
          </View>

          {/* Contacts Card */}
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(30, 41, 59, 0.7)", "rgba(15, 23, 42, 0.4)"]}
              style={styles.cardGradient}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                  <Text style={styles.cardIconText}>👥</Text>
                </View>
                <View>
                  <Text style={styles.cardTitle}>Trusted Contacts</Text>
                  <Text style={styles.cardSubtitle}>
                    {contacts.length} Active {contacts.length === 1 ? 'Contact' : 'Contacts'}
                  </Text>
                </View>
              </View>

              {contacts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Add trusted contacts to notify in emergencies.</Text>
                </View>
              ) : (
                <View style={styles.contactsList}>
                  {contacts.map((c) => (
                    <View key={c.id} style={styles.contactItem}>
                      <View style={styles.contactAvatar}>
                        <Text style={styles.contactAvatarText}>{c.name.charAt(0)}</Text>
                      </View>
                      <View style={styles.contactInfo}>
                        <Text style={styles.contactName}>{c.name}</Text>
                        <Text style={styles.contactPhone}>{c.phoneNumber}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteContact(c.id)}>
                        <Text style={styles.deleteText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Add Contact Inputs */}
              <View style={styles.addContactForm}>
                <TextInput
                  style={styles.modernInput}
                  placeholder="Contact Name"
                  placeholderTextColor="#64748b"
                  value={contactName}
                  onChangeText={setContactName}
                />
                <TextInput
                  style={styles.modernInput}
                  placeholder="Phone Number (+91...)"
                  placeholderTextColor="#64748b"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  keyboardType="phone-pad"
                />
                <TouchableOpacity style={styles.addButton} onPress={handleAddContact}>
                  <Text style={styles.addButtonText}>Access Verification & Add</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.footerSpacing} />
      </ScrollView>

      {/* Background Camera (Memoized to prevent re-renders) */}
      <BackgroundCamera cameraRef={cameraRef} />
    </View>
  );
}

const MotionMonitor = React.memo(({
  tracking,
  cooldown,
  onTrigger
}: {
  tracking: boolean;
  cooldown: boolean;
  onTrigger: () => void;
}) => {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const THRESHOLD = 2.3;
  const lastUpdate = useRef(0);
  const onTriggerRef = useRef(onTrigger); // Stable ref
  const trackingRef = useRef(tracking);
  const cooldownRef = useRef(cooldown);

  // Keep refs synced
  useEffect(() => {
    onTriggerRef.current = onTrigger;
    trackingRef.current = tracking;
    cooldownRef.current = cooldown;
  }, [onTrigger, tracking, cooldown]);

  useEffect(() => {
    console.log("📡 Starting accelerometer listener (Isolated)...");
    Accelerometer.setUpdateInterval(500);

    const subscription = Accelerometer.addListener((accelerometerData) => {
      // 1. Check for Trigger (Logic runs at full speed or throttled)
      const { x, y, z } = accelerometerData;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      if (magnitude > THRESHOLD && !cooldownRef.current && !trackingRef.current) {
        console.log("🚨 Sudden motion detected:", magnitude);
        onTriggerRef.current(); // Trigger Parent
      }

      // 2. Update UI (Throttled)
      const now = Date.now();
      if (now - lastUpdate.current > 500) {
        setData(accelerometerData);
        lastUpdate.current = now;
      }
    });

    return () => {
      console.log("📡 Stopping accelerometer listener...");
      subscription && subscription.remove();
    };
  }, []); // Empty dependency array = runs once on mount (stable)

  const magnitude = Math.sqrt(
    data.x * data.x + data.y * data.y + data.z * data.z
  ).toFixed(2);

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={["rgba(30, 41, 59, 0.7)", "rgba(15, 23, 42, 0.4)"]}
        style={styles.cardGradient}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
            <Text style={styles.cardIconText}>📡</Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>Motion Monitor</Text>
            <Text style={styles.cardSubtitle}>Accelerometer Sensor</Text>
          </View>
        </View>

        <View style={styles.motionContent}>
          <View style={styles.magnitudeContainer}>
            <Text style={styles.motionValue}>{magnitude}</Text>
            <Text style={styles.motionUnit}>G-FORCE</Text>
          </View>

          <View style={styles.thresholdBarContainer}>
            <View style={styles.thresholdTrack}>
              <View
                style={[
                  styles.thresholdFill,
                  {
                    width: `${Math.min((parseFloat(magnitude) / THRESHOLD) * 100, 100)}%`,
                    backgroundColor: parseFloat(magnitude) > THRESHOLD ? '#ef4444' : '#10b981'
                  }
                ]}
              />
            </View>
            <Text style={styles.thresholdLabel}>Threshold: {THRESHOLD}g</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, cooldown ? styles.dotOrange : styles.dotGreen]} />
            <Text style={styles.statusPillText}>{cooldown ? "COOLDOWN" : "MONITORING"}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
});

const BackgroundCamera = React.memo(({ cameraRef }: { cameraRef: any }) => {
  return (
    <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        mode="video"
        facing="back"
        mute={true}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingTop: 70,
    paddingBottom: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  headerContent: {
    alignItems: 'center',
  },
  appTitle: {
    color: "white",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: 'rgba(56, 189, 248, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  appSubtitle: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  sosSection: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 10,
  },
  sosContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 220,
    height: 220,
  },
  sosButtonCore: {
    width: 180,
    height: 180,
    borderRadius: 90,
    elevation: 20,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  sosButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sosButtonActive: {
    borderColor: 'rgba(255,255,255,0.5)',
  },
  sosIcon: {
    fontSize: 42,
    marginBottom: 5,
  },
  sosText: {
    color: "white",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sosSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    marginTop: 5,
    fontWeight: '700',
    letterSpacing: 1,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#ef4444',
    opacity: 0.5,
  },
  pulseRing1: { width: 220, height: 220, opacity: 0.2 },
  pulseRing2: { width: 260, height: 260, opacity: 0.1 },
  pulseRing3: { width: 300, height: 300, opacity: 0.05 },
  cardsContainer: {
    paddingHorizontal: 20,
    gap: 20,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardGradient: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardIconText: {
    fontSize: 20,
  },
  cardTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: "#94a3b8",
    fontSize: 12,
  },
  motionContent: {
    alignItems: 'center',
  },
  magnitudeContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  motionValue: {
    color: "white",
    fontSize: 48,
    fontWeight: "800",
    fontVariant: ['tabular-nums'],
  },
  motionUnit: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  thresholdBarContainer: {
    width: '100%',
    marginTop: 10,
  },
  thresholdTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  thresholdFill: {
    height: '100%',
    borderRadius: 3,
  },
  thresholdLabel: {
    color: "#64748b",
    fontSize: 10,
    textAlign: 'right',
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 15,
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  dotGreen: { backgroundColor: '#10b981' },
  dotOrange: { backgroundColor: '#f59e0b' },
  statusPillText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBadges: {
    gap: 10,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  badgeLabel: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "500",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOk: { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
  badgeFailed: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  badgePending: { backgroundColor: 'rgba(100, 116, 139, 0.2)' },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "white",
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    color: "#64748b",
    fontSize: 14,
  },
  contactsList: {
    marginBottom: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: 'white',
    fontWeight: '700',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  contactPhone: {
    color: '#94a3b8',
    fontSize: 12,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 16,
    padding: 4,
  },
  addContactForm: {
    gap: 12,
  },
  modernInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  addButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  footerSpacing: {
    height: 40,
  },
  logoutSection: {
    marginTop: 40,
    marginBottom: 40,
    alignItems: 'center',
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  logoutButtonText: {
    color: '#64748b',
    fontWeight: '600',
  },
  testButton: {
    marginTop: 20,
    padding: 8,
  },
  testButtonText: {
    color: '#64748b',
    fontSize: 12,
  },
});
