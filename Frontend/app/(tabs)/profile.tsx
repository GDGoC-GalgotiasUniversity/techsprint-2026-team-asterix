import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await axios.get("https://safety-login.onrender.com/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser(res.data);
    } catch (err) {
      console.log("❌ Profile fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Loading Profile...</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Profile Unavailable</Text>
          <Text style={styles.errorText}>
            Unable to load profile information
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerBackground} />
        <View style={styles.headerContent}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarWrapper}>
              <Image
                source={{
                  uri: "https://cdn-icons-png.flaticon.com/512/3177/3177440.png",
                }}
                style={styles.avatar}
              />
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓</Text>
            </View>
          </View>

          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>Registered User</Text>

          <View style={styles.memberSince}>
            <Text style={styles.memberSinceText}>Ageis App Member</Text>
          </View>
        </View>
      </View>

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>SOS Sent</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{user.phone ? 1 : 0}</Text>
          <Text style={styles.statLabel}>Verified</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>24/7</Text>
          <Text style={styles.statLabel}>Protected</Text>
        </View>
      </View>

      {/* Account Information Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>👤</Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>Account Information</Text>
            <Text style={styles.cardSubtitle}>Personal details & credentials</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}>
              <Text style={styles.infoIconText}>📧</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email Address</Text>
              <Text style={styles.infoValue}>{user.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoItem}>
            <View style={styles.infoIcon}>
              <Text style={styles.infoIconText}>📱</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Phone Number</Text>
              <Text style={styles.infoValue}>
                {user.phone || "Not provided"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoItem}>
            <View style={styles.infoIcon}>
              <Text style={styles.infoIconText}>🆔</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>User ID</Text>
              <Text style={styles.infoValue}>{user.id}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Security Status Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>🛡️</Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>Security Status</Text>
            <Text style={styles.cardSubtitle}>Account protection level</Text>
          </View>
        </View>

        <View style={styles.securityStatus}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, styles.statusActive]} />
            <Text style={styles.statusText}>Motion Detection Active</Text>
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, styles.statusActive]} />
            <Text style={styles.statusText}>Voice SOS Ready</Text>
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, user.phone ? styles.statusActive : styles.statusInactive]} />
            <Text style={styles.statusText}>
              {user.phone ? "Phone Verified" : "Phone Not Verified"}
            </Text>
          </View>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Ageis v1.0</Text>
        <Text style={styles.footerSubtext}>Always here to protect you</Text>
      </View>
    </ScrollView>
  );
}

// -----------------------------
//         STYLES
// -----------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
  loadingContainer: {
    alignItems: "center",
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 16,
    marginTop: 16,
    fontWeight: "500",
  },
  errorContainer: {
    alignItems: "center",
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorText: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
  },
  header: {
    backgroundColor: "#1e293b",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 32,
    position: "relative",
    overflow: "hidden",
  },
  headerBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
  },
  headerContent: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    padding: 4,
    backgroundColor: "linear-gradient(135deg, #f97316, #f59e0b)",
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
    backgroundColor: "#1e293b",
    borderWidth: 4,
    borderColor: "#1e293b",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#1e293b",
  },
  verifiedText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  name: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  role: {
    color: "#f97316",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  memberSince: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  memberSinceText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "500",
  },
  statsCard: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 1,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#334155",
    marginHorizontal: 8,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
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
  infoSection: {
    marginTop: 8,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  infoIconText: {
    fontSize: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 2,
    fontWeight: "500",
  },
  infoValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#334155",
    marginLeft: 48,
  },
  securityStatus: {
    marginTop: 8,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  statusActive: {
    backgroundColor: "#10b981",
  },
  statusInactive: {
    backgroundColor: "#6b7280",
  },
  statusText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "500",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  footerText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  footerSubtext: {
    color: "#475569",
    fontSize: 12,
  },
});