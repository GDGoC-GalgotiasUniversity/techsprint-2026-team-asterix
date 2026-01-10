import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { MotiView, useAnimationState } from "moti";
import React, { useEffect, useState } from "react";
import { Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const { width } = Dimensions.get("window");
const BTN_SZ = width / 4 - 12;

export default function LockScreen() {
  const router = useRouter();
  const [input, setInput] = useState("0");
  const [result, setResult] = useState<string | null>(null);

  // 🔐 Security State
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [isSetupMode, setIsSetupMode] = useState(false);

  // Load PIN on mount
  useEffect(() => {
    checkPin();
  }, []);

  const checkPin = async () => {
    try {
      const pin = await AsyncStorage.getItem("CALCULATOR_PIN");
      if (pin) {
        setStoredPin(pin);
      } else {
        setIsSetupMode(true);
        Alert.alert("Set Passcode", "Enter your secret code and press '=' to save it.");
      }
    } catch (e) {
      console.error("Failed to load PIN", e);
    }
  };

  const shake = useAnimationState({
    from: { translateX: 0 },
    wrong: {
      translateX: -10,
      transition: { type: "timing", duration: 100, loop: true, repeat: 3 },
    },
    stop: {
      translateX: 0,
      transition: { type: "timing", duration: 100 },
    },
  });

  const handlePress = async (val: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (val === "AC") {
      setInput("0");
      setResult(null);
      return;
    }

    if (val === "⌫") {
      setInput((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
      return;
    }

    if (val === "=") {
      // 🆕 SETUP MODE: Save the PIN
      if (isSetupMode) {
        if (input.length < 4) {
          Alert.alert("Too Short", "Passcode must be at least 4 digits.");
          return;
        }
        try {
          await AsyncStorage.setItem("CALCULATOR_PIN", input);
          setStoredPin(input);
          setIsSetupMode(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Success", "Passcode saved! Remember it.");
          setInput("0");
        } catch (e) {
          Alert.alert("Error", "Could not save passcode.");
        }
        return;
      }

      // 🕵️‍♂️ CHECK FOR SECRET UNLOCK CODE
      if (input === storedPin) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/login");
        return;
      }

      // 🧮 PERFORM CALCULATION
      try {
        // Replace visual operators with JS operators
        // Also remove leading zeros from numbers to avoid octal/strict mode issues (e.g., "05" -> "5")
        const evalString = input
          .replace(/×/g, "*")
          .replace(/÷/g, "/")
          .replace(/\b0+(\d+)/g, "$1");

        // eslint-disable-next-line no-new-func
        const res = new Function("return " + evalString)();

        // Format result
        const formatted = Number.isInteger(res) ? res.toString() : res.toFixed(2);
        setInput(formatted);
        setResult(null);
      } catch (e) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shake.transitionTo("wrong");
        setTimeout(() => shake.transitionTo("stop"), 400);
        setInput("Error");
        setTimeout(() => setInput("0"), 1000);
      }
      return;
    }

    // Append number/operator
    setInput((prev) => {
      if (prev === "Error") return val;

      // Special handling for initial "0"
      if (prev === "0") {
        if (val === "0") return "00"; // Allow creating "00"
        if (val === ".") return "0.";
        if (["+", "-", "×", "÷"].includes(val)) return prev + val;
        return val; // Replace "0" with 1-9
      }

      return prev + val;
    });
  };

  const renderButton = (label: string, type: "number" | "operator" | "action" = "number") => {
    let bg = "#333333"; // Dark Grey (Numbers)
    let color = "#fff";

    if (type === "operator") {
      bg = "#FE9600"; // Orange (Operators)
      color = "#fff";
    } else if (type === "action") {
      bg = "#a5a5a5"; // Light Grey (Top row)
      color = "#000";
    }

    if (label === "=") {
      bg = "#FE9600"; // Same Orange for equals
    }

    return (
      <TouchableOpacity
        key={label}
        style={[styles.button, { backgroundColor: bg }]}
        onPress={() => handlePress(label)}
      >
        <Text style={[styles.buttonText, { color }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={["#000000", "#1c1c1c"]} style={styles.container}>
      {/* Display Screen */}
      <View style={styles.displayContainer}>
        <MotiView state={shake}>
          <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
            {input}
          </Text>
        </MotiView>
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {/* 🛠️ TEMP DEBUG BUTTON: Clear Data */}


        <View style={styles.row}>
          {renderButton("AC", "action")}
          {renderButton("(", "action")}
          {renderButton(")", "action")}
          {renderButton("÷", "operator")}
        </View>
        <View style={styles.row}>
          {renderButton("7")}
          {renderButton("8")}
          {renderButton("9")}
          {renderButton("×", "operator")}
        </View>
        <View style={styles.row}>
          {renderButton("4")}
          {renderButton("5")}
          {renderButton("6")}
          {renderButton("-", "operator")}
        </View>
        <View style={styles.row}>
          {renderButton("1")}
          {renderButton("2")}
          {renderButton("3")}
          {renderButton("+", "operator")}
        </View>
        <View style={styles.row}>
          {renderButton("0")}
          {renderButton(".")}
          {renderButton("⌫")}
          {renderButton("=", "operator")}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 30,
  },
  displayContainer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 20,
    paddingBottom: 40,
  },
  displayText: {
    color: "#fff",
    fontSize: 80,
    fontWeight: "300",
    textAlign: "right",
  },
  keypad: {
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  button: {
    width: BTN_SZ,
    height: BTN_SZ,
    borderRadius: BTN_SZ / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 32,
    fontWeight: "500",
  },
});
