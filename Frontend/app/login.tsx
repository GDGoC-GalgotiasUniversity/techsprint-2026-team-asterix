import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useRouter } from "expo-router";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // ✅ FIX ADDED

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    const token = await AsyncStorage.getItem("token");
    if (!token) return;

    const meRes = await fetch("https://safety-login.onrender.com/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (meRes.ok) {
      router.replace("/(tabs)");
    }
  };

  const loginUser = async () => {
    if (!email || !password) {
      alert("Enter email and password");
      return;
    }

    setLoading(true); // 🔥 FIX

    try {
      const response = await fetch("https://safety-login.onrender.com/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const token = await response.text(); // raw string token

      if (!response.ok) {
        alert("Invalid credentials");
        setLoading(false);
        return;
      }

      // Save token
      await AsyncStorage.setItem("token", token);

      // Validate using /me
      const meRes = await fetch("https://safety-login.onrender.com/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (meRes.ok) {
        router.replace("/(tabs)");
      } else {
        alert("Token invalid");
      }
    } catch (error) {
      alert("Network error");
      console.log(error);
    }

    setLoading(false); // 🔥 FIX
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.btn} onPress={loginUser} disabled={loading}>
        <Text style={styles.btnText}>{loading ? "Please wait..." : "Login"}</Text>
      </TouchableOpacity>

      <Link href="/register" style={styles.link}>
        Create new account
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { color: "#fff", fontSize: 30, marginBottom: 25 },
  input: {
    width: "85%",
    padding: 15,
    backgroundColor: "#222",
    color: "#fff",
    borderRadius: 10,
    marginBottom: 15,
  },
  btn: {
    width: "85%",
    backgroundColor: "#27ae60",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 18 },
  link: { color: "#3498db", marginTop: 20, fontSize: 16 },
});
