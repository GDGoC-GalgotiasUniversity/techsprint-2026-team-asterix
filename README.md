# Ageis - Team Asterix

> **TechSprint Hackathon 2026** - *Empowering safety through technology.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Expo](https://img.shields.io/badge/Expo-Go-000020?style=flat&logo=expo&logoColor=white)](https://expo.dev/)
[![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.0+-6DB33F?style=flat&logo=spring-boot&logoColor=white)](https://spring.io/projects/spring-boot)

## 📖 Overview

The **Ageis** is a comprehensive mobile application designed to provide immediate assistance to individuals in distress. Built with a robust **Spring Boot** backend and a responsive **React Native (Expo)** frontend, the app bridges the gap between emergency contacts and the user during critical situations.

### Key Capabilities
- **🚨 Instant SOS**: Trigger emergency alerts with a single tap or voice command.
- **📍 Real-time Tracking**: Live location sharing with trusted contacts.
- **🎙️ Audio & Video Evidence**: Automatically records and streams audio/video to the server when SOS is activated.
- **⚡ Quick Actions**: Shake-to-alert and voice-activated emergency modes.

---

## 👥 Team Asterix

| Name | Role | Email |
| :--- | :--- | :--- |
| **Saransh Rana** | Team Lead | saranshrana08@gmail.com |
| **Manish Kumar** | Member | manishkumarmgs019@gmail.com |
| **Ishita Katiyar** | Member | iishitakatiyar@gmail.com |

---

## 🛠️ Technology Stack

### Mobile Frontend
*   **Framework**: [React Native](https://reactnative.dev/) with [Expo](https://expo.dev/)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **State Management**: React Hooks
*   **UI/UX**: Custom Components, Expo Vector Icons
*   **Key Libraries**:
    *   `expo-av`: For audio recording and playback.
    *   `expo-camera`: For video capturing.
    *   `expo-location`: For real-time geolocation tracking.
    *   `expo-sms`: For sending emergency messages.

### Backend API
*   **Framework**: [Spring Boot](https://spring.io/projects/spring-boot) (Java 17)
*   **Build Tool**: Maven
*   **Database**: H2 Database (In-Memory for Dev/Test)
*   **Security**: Spring Security (Planned/In-progress)
*   **Testing**: JUnit, Spring Boot Test

---

## 🚀 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites
1.  **Node.js** (LTS version recommended)
2.  **Java Development Kit (JDK) 17** or higher
3.  **Maven** (for Backend)
4.  **Expo Go** app on your physical device (Android/iOS)

### 1️⃣ Backend Setup (Spring Boot)

The backend handles API requests, user data, and media uploads.

```bash
# Navigate to the backend directory
cd Backend

# Build the project (skip tests for faster build)
mvn clean install -DskipTests

# Run the application
mvn spring-boot:run
```
*The server will start on `http://localhost:8080`*

### 2️⃣ Frontend Setup (Expo)

The frontend is the mobile interface for the user.

```bash
# Navigate to the frontend directory
cd Frontend

# Install dependencies
npm install

# Start the Expo development server
npx expo start
```

**To run on your device:**
1.  Open the **Expo Go** app on your phone.
2.  Scan the QR code displayed in the terminal.
3.  Ensure your phone and computer are on the **same Wi-Fi network**.

---

## 📱 Features Breakdown

### 🔐 Authentication
*   Secure **Login** and **Registration** screens.
*   User session management.

### 🆘 Emergency SOS
*   **Voice SOS**: Activates by voice command to discreetly send alerts.
*   **Video SOS**: Captures live video evidence and uploads it to the backend.

### 🗺️ Geolocation
*   Precise location tracking.
*   Real-time updates sent to the backend/emergency contacts.

---

## 🤝 Contributing

This project was developed for **TechSprint 2026**. While currently a hackathon project, suggestions and improvements are welcome!

