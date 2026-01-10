import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Link, useRouter } from "expo-router";

export default function Register() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // FIX ✔

  const registerUser = async () => {
    if (!name || !phone || !email || !password) {
      alert("All fields are required!");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("https://safety-login.onrender.com/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
        }),
      });

      const message = await response.text(); // RAW TEXT ✔

      if (!response.ok) {
        alert(message || "Registration failed");
        setLoading(false);
        return;
      }

      // Your API returns: "User Registered Successfully!"
      if (message.includes("User Registered Successfully")) {
        alert("Registration successful! Please login.");
        router.replace("/login");
      } else {
        alert(message);
      }
    } catch (error) {
      alert("Network error");
      console.log(error);
    }

    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>

      <TextInput
        style={styles.input}
        placeholder="Full Name"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
      />

      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        placeholderTextColor="#888"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />

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

      <TouchableOpacity
        style={styles.btn}
        onPress={registerUser}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? "Registering..." : "Register"}
        </Text>
      </TouchableOpacity>

      <Link href="/login" style={styles.link}>
        Already have an account? Login
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
    marginTop: 5,
  },
  btnText: { color: "#fff", fontSize: 18 },
  link: { color: "#3498db", marginTop: 20 },
});
